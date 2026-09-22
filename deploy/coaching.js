import {measurements, nearestSample, visible} from './analysis.js';
import {fileTime} from './timing.js';
import {keyMomentEntries} from './keyframes.js';

export const FEEDBACK_LABELS={good:'Looks good',check:'Check this',info:'Before judging',practice:'Try next'};
const median=values=>[...values].sort((a,b)=>a-b)[Math.floor(values.length/2)];
const finding=(kind,title,body)=>({kind,title,body});
const PHASE_ADVICE={
  address:{title:'Start relaxed',body:'Check that your arms hang comfortably and your knees are softly flexed. A still image cannot confirm tension or balance.',practice:'Take your grip, soften your knees, then let your arms hang before settling into setup.'},
  backswing:{title:'Keep room for the swing',body:'Check that your chest turns with your arms, rather than your hands lifting on their own.',practice:'Make three slow half backswings with a relaxed lead arm. Turn your chest with your hands.'},
  top:{title:'Choose a comfortable backswing',body:'Check whether your arms keep lifting after your chest stops turning. More length is not always more useful.',practice:'Rehearse a shorter backswing. Stop where your chest and arms can change direction together without strain.'},
  downswing:{title:'Avoid rushing from the top',body:'Watch the motion into this frame. A still image cannot tell whether the transition is smooth or rushed.',practice:'Pause briefly at the top in a rehearsal, then swing down smoothly. Repeat before a slow half swing.'},
  impact:{title:'Check actual contact',body:'Step through nearby frames to find ball contact. The automatic impact marker follows hand movement, not the ball.',practice:'Make short, easy swings, continuing your chest and arms through the ball. Avoid forcing a locked lead elbow.'},
  follow:{title:'Keep moving through the ball',body:'Check that your chest keeps turning as your arms continue through. The elbows naturally fold later in the finish.',practice:'Rehearse a slow half swing through the ball, then continue into a comfortable finish without stopping at contact.'},
  finish:{title:'Test your finish balance',body:'Can you hold this finish without a recovery step? One frame cannot establish balance or weight distribution.',practice:'After an easy swing, hold your finish for a count of three. Reduce speed if you need a recovery step.'}
};

// These are change-detection tolerances, not ideal golf angles. Require three
// nearby tracked samples, reject noisy neighborhoods and compare the golfer
// with their own marked/estimated phase, never with a universal target angle.
function reliableAngle(slot,time,key) {
  if(!Number.isFinite(time))return null;
  const measure=sample=>measurements(sample?.points,slot.video.videoWidth,slot.video.videoHeight,slot.hand)[key];
  const exact=measure(nearestSample(slot.samples,time,slot.tolerance));
  if(!Number.isFinite(exact))return null;
  const radius=fileTime(.08,slot);
  const nearby=slot.samples.filter(s=>Math.abs(s.time-time)<=radius+1e-7);
  const values=nearby.map(measure).filter(Number.isFinite);
  if(values.length<3||values.length<nearby.length*.8)return null;
  const value=median(values),spread=Math.max(...values)-Math.min(...values);
  if(spread>18||Math.abs(value-exact)>10)return null;
  return {value,spread};
}

function holdsPosition(slot,time,phase) {
  const span=fileTime(phase==='address'?.25:.6,slot),start=phase==='address'?time-span:time,end=start+span;
  const samples=slot.samples.filter(s=>s.time>=start-1e-7&&s.time<=end+1e-7);
  const joints=[11,12,23,24,27,28],w=slot.video.videoWidth,h=slot.video.videoHeight;
  if(samples.length<4||samples.at(-1).time-samples[0].time<span*.8)return false;
  if(samples.some((s,i)=>!joints.every(j=>visible(s.points?.[j]))||(i&&s.time-samples[i-1].time>fileTime(.1,slot))))return false;
  const distance=(a,b)=>Math.hypot((a.x-b.x)*w,(a.y-b.y)*h);
  const base=samples[0].points,torso=(distance(base[11],base[23])+distance(base[12],base[24]))/2;
  // Report visible steadiness, not center of pressure or proven balance.
  return torso>h*.1&&samples.every(s=>joints.every(j=>distance(base[j],s.points[j])<torso*.12));
}

export function coachingFeedback(slot,time,entry,{tracked=false}={}) {
  const result=(findings,practice,basis)=>({findings,practice,basis});
  if(!tracked)return result([finding('info','No reliable body tracking',slot.samples.length?'The joints are not clear enough here to judge your technique.':'Analyze this video to get feedback for this frame.')],
    slot.samples.length?'Choose a nearby frame with visible arms and legs, or record the full body in brighter light.':'Pause near your swing and choose Analyze beside Speed.', 'Technique feedback needs visible, tracked movement.');
  if(!entry||!['marked','estimated'].includes(entry.source)||!PHASE_ADVICE[entry.key])return result([
    finding('info','Identify the swing moment first','This is a range preview or an unassigned frame, so phase-specific strengths and faults cannot be identified.')],
    'Jump to a recognizable swing moment and set it on its card, or analyze a complete swing.', 'Measurements are available below; this is not a detected swing phase.');

  const phase=entry.key,advice=PHASE_ADVICE[phase],findings=[];
  let practice=advice.practice;
  const moments=keyMomentEntries(slot);
  if(['address','finish'].includes(phase)&&holdsPosition(slot,time,phase)){
    findings.push(phase==='address'?finding('good','Settled setup','Your shoulders, hips and feet stay steady just before takeaway. Keep that settled start while letting your arms stay relaxed.'):
      finding('good','Steady finishing position','Your shoulders, hips and feet stay steady after this frame. Build on that by holding the finish longer.'));
  }
  function difference(key,reference) {
    const moment=moments.find(m=>m.key===reference&&['marked','estimated'].includes(m.source)&&Number.isFinite(m.time));
    // Out-of-order edits and overlapping neighborhoods are not evidence of
    // a change between two distinct swing phases.
    if(!moment||time-moment.time<=fileTime(.16,slot))return null;
    const before=reliableAngle(slot,moment.time,key),now=reliableAngle(slot,time,key);
    return before&&now?{change:now.value-before.value,noise:before.spread+now.spread}:null;
  }
  if(['backswing','top','impact'].includes(phase)){
    const arm=difference('elbow','address');
    if(arm&&Math.abs(arm.change)<=10&&arm.noise<=12){
      findings.push(finding('good','Consistent lead-arm shape','Your lead arm keeps a similar shape to setup in this view. Keep it relaxed as you turn.'));
    } else if(arm&&arm.change<-Math.max(20,arm.noise)){
      findings.push(finding('check',phase==='impact'?'Lead arm folds before contact':'Lead arm folds on the way back',
        'Your lead arm bends more than at setup. Check for lost swing width; some bend can suit your swing.'));
      practice=phase==='impact'?'Verify the contact frame, then try easy half swings with relaxed arms extending through the ball. Do not lock the elbow.':
        'Try a shorter backswing with a relaxed lead arm. Compare whether it keeps more width without forcing the elbow straight.';
    }
  }
  if(['downswing','impact','follow'].includes(phase)){
    const reference=phase==='follow'?'impact':'top',arm=difference('trailElbow',reference);
    if(arm&&arm.change>Math.max(20,arm.noise))findings.push(finding('good','Trail arm is unfolding',
      phase==='follow'?'Your trail arm opens after impact in this view. Let your chest keep turning as the swing continues.':
        'Your trail arm opens from the top toward the ball. Keep that motion flowing into the follow-through.'));
    else if(arm&&phase==='impact'&&arm.change<-Math.max(20,arm.noise)){
      findings.push(finding('check','Trail arm folds further toward contact','Your trail arm is more bent than at the top. Verify the impact frame and check for pulling inward.'));
    }
  }
  // Keep both a strength and an attention point when both are observed.
  // Fill remaining space with a clearly worded visual checkpoint, never a
  // manufactured fault. Two findings plus one rehearsal stay easy to scan.
  if(findings.length<2)findings.push(finding('check',advice.title,advice.body));
  return result(findings,practice,`${entry.source==='estimated'?'Automatic moment; verify the frame. ':''}Suggestions use this camera view, not a swing score.`);
}

// One wording source for the online report and every frame's PDF page.
export function coachingObservations(coaching) {
  return [...coaching.findings.map(f=>`${FEEDBACK_LABELS[f.kind]}: ${f.title}. ${f.body}`),`${FEEDBACK_LABELS.practice}: ${coaching.practice}`];
}
