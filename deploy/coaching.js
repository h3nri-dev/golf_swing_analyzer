import {measurements, nearestSample, visible} from './analysis.js';
import {fileTime} from './timing.js';
import {keyMomentEntries} from './keyframes.js';

export const FEEDBACK_LABELS={good:'Good',check:'Needs attention',info:'Check visually',unavailable:'Not enough data',practice:'Try next'};
const median=values=>[...values].sort((a,b)=>a-b)[Math.floor(values.length/2)];
const finding=(kind,title,body)=>({kind,title,body});
// Restore the original phase-by-phase checklist. A checkpoint stays visible
// even when this camera view cannot measure it; that is not a failed check.
const CHECKS={
  posture:['Torso posture','Check your posture in nearby frames. A changing camera view can change the apparent tilt.'],
  leadArm:['Lead arm','Keep comfortable swing width without forcing your lead elbow straight.'],
  knees:['Knee flex','Look for soft knee flex and a comfortable stance, without a deep squat.'],
  wrist:['Lead wrist','Review your grip and wrist action. Body landmarks cannot establish wrist cupping or clubface direction.'],
  alignment:['Shoulder / hip alignment','Check your setup against your target line. Image slopes cannot establish whether your body is square.'],
  shoulderTurn:['Shoulder turn','Watch your chest turn with your arms. The shoulder line on screen does not measure your full turn.'],
  hipTurn:['Hip turn','Review how your hips turn with the swing. The hip line on screen does not measure rotation.'],
  separation:['Shoulders and hips','Watch their movement together in slow playback. This view cannot measure three-dimensional separation.'],
  hinge:['Wrist hinge','Review the club and hands together. Body landmarks alone cannot judge wrist hinge or retained lag.'],
  trailFold:['Trail elbow','Check that your elbow folds comfortably at the top. This image cannot reliably judge whether it is tucked.'],
  leadKnee:['Lead knee','Check that your lead knee supports a comfortable turn without forcing it straight or deeply bending it.'],
  sequence:['Hip-led transition','Watch the transition in slow playback. A still frame cannot establish which body segment starts first.'],
  trailArm:['Trail arm','Watch your trail arm unfold toward the ball and continue through, without forcing the elbow straight.'],
  contact:['Contact frame','Check actual contact in nearby frames. The automatic impact marker follows hands, not the ball.'],
  finishTurn:['Body turn','Check that your chest and hips continue into a comfortable finish; avoid stopping abruptly at contact.'],
  balance:['Finish balance','Try holding the finish for three counts without a recovery step. A still frame cannot establish balance.'],
  leadLeg:['Lead leg','Review how your lead leg supports the finish. Avoid forcing it into a locked position.'],
  settled:['Settled setup','Pause briefly at setup with relaxed arms. Check that your shoulders, hips and feet settle before takeaway.']
};
export const PHASE_CHECKS={
  address:['posture','leadArm','knees','wrist','alignment','settled'],
  backswing:['leadArm','shoulderTurn','separation','wrist'],
  top:['shoulderTurn','hipTurn','separation','hinge','trailFold','leadKnee','leadArm'],
  downswing:['sequence','hinge','separation','leadArm','trailArm'],
  impact:['leadArm','wrist','hipTurn','posture','knees','trailArm','contact'],
  follow:['trailArm','shoulderTurn','posture'],
  finish:['finishTurn','balance','posture','leadLeg']
};
const PRACTICE={
  address:'Take your grip, soften your knees and let your arms hang before settling into setup.',
  backswing:'Make three slow half backswings with a relaxed lead arm. Turn your chest with your hands.',
  top:'Rehearse a comfortable shorter backswing, with your chest and arms changing direction together.',
  downswing:'Pause briefly at the top in a rehearsal, then swing down smoothly into a slow half swing.',
  impact:'Make easy half swings, continuing your chest and arms through the ball without locking the lead elbow.',
  follow:'Rehearse a slow half swing through the ball, then continue into a comfortable finish.',
  finish:'Hold your finish for a count of three after an easy swing. Reduce speed if you need a recovery step.'
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
  // Show observed strengths and concerns first, without dropping the other
  // phase checkpoints. Keep their phase order within each evidence group.
  const priority=f=>['good','check'].includes(f.kind)?0:1;
  const result=(findings,practice,basis)=>({findings:findings.sort((a,b)=>priority(a)-priority(b)),practice,basis});
  if(!entry||!['marked','estimated'].includes(entry.source)||!PHASE_CHECKS[entry.key])return result([
    finding('info',tracked?'Identify the swing moment first':'No reliable body tracking',tracked?
      'This is a range preview or an unassigned frame. Set a recognizable moment to evaluate each checkpoint.':
      slot.samples.length?'The joints are not clear enough here to judge your technique.':'Analyze this video to get feedback for this frame.')],
    tracked?'Set a recognizable moment on its card, or analyze a complete swing.':
      slot.samples.length?'Choose a nearby frame with visible arms and legs, or record the full body in brighter light.':'Pause near your swing and choose Analyze beside Speed.',
    'No swing phase has been confirmed for this frame.');

  const phase=entry.key,moments=keyMomentEntries(slot);
  const findings=PHASE_CHECKS[phase].map(key=>({...finding(tracked?'info':'unavailable',...CHECKS[key]),key}));
  const set=(key,kind,body)=>{
    const check=findings.find(f=>f.key===key);if(check)Object.assign(check,{kind,body});
  };
  let practice=PRACTICE[phase];
  if(phase==='address')set('posture',tracked?'info':'unavailable','Lean forward comfortably from your hips with soft knees. Leave room for your arms to hang.');
  if(phase==='impact')set('knees',tracked?'info':'unavailable','Watch how your knees move from setup through contact. Avoid forcing them straight to match a target angle.');
  if(phase==='finish')set('posture',tracked?'info':'unavailable','Review whether you finish comfortably upright, without straining to lean back. Check the moving sequence too.');
  if(!tracked){
    const message=slot.samples.length?'No reliable body tracking at this frame.':'Analyze this video to get feedback for this frame.';
    findings.forEach(f=>{f.body=message;});
    return result(findings,slot.samples.length?'Choose a nearby frame with visible arms and legs, or record the full body in brighter light.':'Pause near your swing and choose Analyze beside Speed.',
      'These checkpoints could not be evaluated. Missing data is not a technique fault.');
  }
  function difference(key,reference) {
    const moment=moments.find(m=>m.key===reference&&['marked','estimated'].includes(m.source)&&Number.isFinite(m.time));
    // Out-of-order edits and overlapping neighborhoods are not evidence of
    // a change between two distinct swing phases.
    if(!moment||time-moment.time<=fileTime(.16,slot))return null;
    const before=reliableAngle(slot,moment.time,key),now=reliableAngle(slot,time,key);
    return before&&now?{change:now.value-before.value,noise:before.spread+now.spread}:null;
  }
  function compare(check,key,reference,onReliable) {
    const delta=difference(key,reference);
    if(delta)onReliable(delta);
    else set(check,'unavailable',`Needs clear tracking here and at ${reference}. Review both frames before judging this point.`);
  }
  if(['backswing','top','downswing','impact'].includes(phase))compare('leadArm','elbow','address',arm=>{
    if(Math.abs(arm.change)<=10&&arm.noise<=12){
      set('leadArm','good','Your lead arm keeps a similar shape to setup in this view. Keep it relaxed as you turn.');
    } else if(arm.change<-Math.max(20,arm.noise)){
      set('leadArm','check','Your lead arm bends more than at setup. Check for lost swing width; some bend can suit your swing.');
      practice=['impact','downswing'].includes(phase)?'Verify the contact frame, then try easy half swings with relaxed arms extending through the ball. Do not lock the elbow.':
        'Try a shorter backswing with a relaxed lead arm. Keep width without forcing the elbow straight.';
    }
  });
  if(['downswing','impact','follow'].includes(phase)){
    const reference=phase==='follow'?'impact':'top';
    compare('trailArm','trailElbow',reference,arm=>{
      if(arm.change>Math.max(20,arm.noise))set('trailArm','good',phase==='follow'?
        'Your trail arm opens after impact in this view. Let your chest keep turning as the swing continues.':
        'Your trail arm opens from the top toward the ball. Keep that motion flowing into the follow-through.');
      else if(phase==='impact'&&arm.change<-Math.max(20,arm.noise)){
        set('trailArm','check','Your trail arm is more bent than at the top. Verify contact and check for pulling inward.');
      }
    });
  }
  if(['impact','follow'].includes(phase))compare('posture','lean','address',torso=>{
    if(Math.abs(torso.change)<=10&&torso.noise<=12)set('posture','good','Your torso tilt stays similar to setup in this camera view. Keep turning through comfortably.');
    else if(Math.abs(torso.change)>Math.max(20,torso.noise))set('posture','check','Your torso tilt changes visibly from setup. Review nearby frames for rising or dipping; perspective can affect this reading.');
  });
  if(['backswing','impact'].includes(phase))compare('wrist','wrist','address',wrist=>{
    if(Math.abs(wrist.change)<=10&&wrist.noise<=12)set('wrist','good','Your hand-to-forearm shape stays similar to setup in this view. This does not establish clubface direction.');
    // A changed projected wrist angle alone is not a demonstrated swing fault.
  });
  // A partially tracked body must not imply every individual joint was read.
  const required={posture:['lean'],leadArm:['elbow'],knees:['knee','trailKnee'],wrist:['wrist'],hinge:['wrist'],trailFold:['trailElbow'],leadKnee:['knee'],leadLeg:['knee']};
  for(const [check,keys] of Object.entries(required))if(findings.some(f=>f.key===check&&f.kind==='info')&&keys.some(key=>!reliableAngle(slot,time,key))){
    set(check,'unavailable','Tracking is unclear for this point. Choose a nearby frame where these joints are visible.');
  }
  if(phase==='address'&&holdsPosition(slot,time,phase))set('settled','good','Your shoulders, hips and feet stay steady before takeaway. Keep that settled start with relaxed arms.');
  if(phase==='finish'&&holdsPosition(slot,time,phase))set('balance','good','Your shoulders, hips and feet stay steady after this frame. Build on this by holding the finish longer.');
  return result(findings,practice,`${entry.source==='estimated'?'Automatic moment; verify the frame. ':''}Good and Needs attention describe visible evidence. Check visually means no automatic verdict.`);
}

// One wording source for the online report and every frame's PDF page.
export function coachingObservations(coaching) {
  return [...coaching.findings.map(f=>`${FEEDBACK_LABELS[f.kind]}: ${f.title}. ${f.body}`),`${FEEDBACK_LABELS.practice}: ${coaching.practice}`];
}
