'use strict';
// Normalization follows CodePet's chat-events.js (MIT; see CODEPET-LICENSE),
// extended for session ids, streamed AGY steps, and failures with partial text.
function normalize(provider, e, parts) {
  const out=[];
  const id=e.session_id||e.conversation_id||e.result?.conversation_id;
  if(id)out.push({kind:'session',id});
  if(provider==='opencode')return opencode(e,out,parts);
  if(provider==='claude') {
    const inner=e.event;
    if(e.type==='stream_event'&&inner?.type==='content_block_delta'&&inner.delta?.type==='text_delta')out.push({kind:'delta',text:inner.delta.text||''});
    if(e.type==='stream_event'&&inner?.content_block?.type==='tool_use')out.push({kind:'status',status:'working'});
    if(e.type==='result')out.push(e.is_error||e.subtype!=='success'?{kind:'error',message:e.result||e.errors?.join('\n')||e.subtype}:{kind:'final',text:e.result||'',sessionId:e.session_id});
  } else if(provider==='agy') {
    const s=e.step_update;
    if(e.event==='step_update'&&s?.step_type==='agent_response'&&s.text_delta)out.push({kind:'delta',text:s.text_delta});
    if(e.event==='step_update'&&s?.step_type==='tool')out.push({kind:'status',status:'working'});
    if(e.event==='result')out.push(e.result?.status==='SUCCESS'?{kind:'final',text:e.result.response||'',sessionId:e.result.conversation_id}:{kind:'error',message:e.result?.error||e.result?.status||'Antigravity 응답 오류'});
  }
  return out;
}
/** `opencode run --format json` replays whole parts, so each part id is diffed into a delta. */
function opencode(e,out,parts) {
  const sid=e.sessionID||e.sessionId;
  if(sid)out.push({kind:'session',id:sid});
  const part=e.part;if(!part)return out;
  const type=part.type;
  if(type==='text'||type==='reasoning') {
    const key=part.id||part.messageID||type;
    const previous=(parts&&parts.get(key))||'', now=String(part.text||'');
    if(parts)parts.set(key,now);
    if(now.length<=previous.length||!now.startsWith(previous))return out;
    const delta=now.slice(previous.length);if(!delta)return out;
    out.push(type==='reasoning'?{kind:'thinking',text:delta}:{kind:'delta',text:delta});
    return out;
  }
  if(type==='tool') {
    const state=part.state||{},input=state.input||{};
    // One line the user can read while the tool runs: the command, path or tool name.
    const detail=input.command||input.filePath||input.path||input.url||state.title||part.title||'';
    const label=(part.tool||'tool')+(detail?' '+detail:'');
    out.push({kind:'step',text:'$ '+String(label).replace(/\s+/g,' ').slice(0,400),
      status:state.status==='running'?'working':'working'});
  }
  return out;
}
module.exports={normalize};
