import {CITY_EXPEDITION,EXPEDITION_STEPS,getExpedition} from './expedition.js';
import {getMission,getBoss} from './campaign.js?v=0.29.0';
import {storyForMission} from './story-campaign.js';
const openings=[
 '여기는 구조대원 한도윤. 마트 앞 대피소와 연락이 끊겼다. 먼저 공사장 확성기에 전원을 넣겠다.',
 '수로에 구조대 표시가 남아 있어요. 물소리가 들리면 무전기를 높이 들어요. 신호를 놓치지 마요.',
 '송장의 냉장 화물 번호가 맞아요. 약이 없어도 기록은 남아 있을 거예요. 컨테이너를 확인해요.',
 '백신이라는 말부터 믿지 마요. 감염을 늦추는 약과 치료법은 달라요. 검사 기록이 필요해요.',
 '도윤 씨, 명단에 이름이 있다고 살아 있다는 뜻은 아니에요. …그래도 제가 같이 찾아볼게요.',
 '터미널 통신은 아직 살아 있어요. 버스 중계기를 확보하면 이송 차량의 마지막 위치를 볼 수 있어요.',
 '전원을 넣으면 저것들도 움직여요. 송신이 끝날 때까지만 버텨요. 제가 회로를 끊을게요.',
 '이 연료는 탈출용만이 아니에요. 약을 찾으면 냉장고를 계속 돌려야 해요. 한 통도 버리지 마요.',
 '캡슐 안에 약이 없더라도 가져와요. 살아 있는 원액은 밖으로 꺼내는 순간부터 죽기 시작하니까요.',
 '차체는 버려도 돼요. 냉각 장치와 배터리만 살아 있으면 우리가 옮길 수 있어요.',
 '숨이 좀 가빠요. 무전은 끄지 말아요. 제 목소리가 이상해지면… 그때도 기록은 챙겨요.',
 '백신은 아직 여기 없어요. 하지만 이제 어디로 가야 하는지 알아요. 도윤 씨, 배까지 살아서 와요.'
];
export function radioCue(game,event={type:'start'}){
 const expedition=getExpedition(game?.expedition?.id);if(expedition){if(event.type==='start')return {key:'expedition-start',speaker:'한도윤 / 구조대',text:expedition.opening?expedition.opening:expedition.id===CITY_EXPEDITION.id?'대피소 신호가 공사장 앞에서 끊겼다. 거리 중계기부터 살린다. 약을 찾으면 옥상 계단으로 올라가겠어.':'옥상에 올라왔다. 발전기를 살리고 연결교 너머 송신대를 지킨다. 윤서, 병원 채널을 잡아 줘.',duration:8};if(event.type==='expedition-prepared'&&expedition.vaccineEnding===true&&event.id==='finale-preparation'&&game.expedition.prepHold===30&&game.expedition.step===0)return {key:'finale-prepared',speaker:'서윤서 / 원격 연구자',text:'냉각 장치가 안정됐어요. 이제 배양 열쇠를 연결해 마지막 봉인을 열어요. 개조와 장비를 확인하고 움직여요.',duration:7};if(event.type==='expedition-relay'&&event.step===game.expedition.step&&expedition.steps[event.step]?.kind==='relay'&&Number.isInteger(event.channel)&&event.channel>=0&&event.channel<expedition.steps[event.step].zones.length&&event.channel===Math.floor((game.expedition.hold+1e-8)/expedition.steps[event.step].interval)%expedition.steps[event.step].zones.length)return {key:'relay-'+Math.floor((game.expedition.hold+1e-8)/expedition.steps[event.step].interval),speaker:'서윤서 / 원격 연구자',text:'채널 '+(event.channel===0?'A':'B')+'가 응답해요. 반대편 중계기로 이동해요. 전송한 승인 자료는 유지돼요.',duration:5};if(event.type==='expedition-step'&&event.step===game.expedition.step&&event.step>0&&event.step<=expedition.steps.length)return {key:'expedition-'+event.step,speaker:'서윤서 / 원격 연구자',text:expedition.steps[event.step-1].clue,duration:7};return null;}
 const mission=getMission(game?.missionId),story=storyForMission(mission?.id);if(!mission||!story)return null;
 if(event.type==='start')return {key:'start',speaker:mission.index===0?'한도윤 / 구조대':'서윤서 / 원격 연구자',text:openings[mission.index],duration:8};
 const boss=getBoss(event.bossKey);if(!boss||boss.missionId!==mission.id)return null;
 if(event.type==='boss')return {key:event.type+boss.id,speaker:'서윤서 / 원격 연구자',text:boss.role==='mid'?`${boss.name}이 통로를 막고 있어요. ${boss.counter}`:`마지막 봉쇄자 ${boss.name}이에요. 기록을 가지고 나가려면 저길 지나야 해요.`,duration:7};
 if(event.type==='bossdefeat'&&boss.role==='mid'&&game.defeatedBossIds?.includes(boss.id))return {key:event.type+boss.id,speaker:'한도윤 / 구조대',text:'첫 봉쇄선은 열었다. 기록이 있는 곳까지 길은 이어져 있어. 윤서, 신호 계속 보내 줘.',duration:6};
 return null;
}
// Presentation clocks use simulation time. No progression fields, IDs or saves
// are modified. Binding a restored run does not replay its opening transmission.
export class StoryRadioClock{
 constructor(){this.game=null;this.queue=[];this.seen=new Set();this.current=null;}
 bind(game){if(this.game===game)return;this.game=game;this.queue=[];this.seen=new Set();this.current=null;if(game?.state==='playing'&&game.time<.5)this.enqueue(radioCue(game));}
 enqueue(cue){if(!cue||this.seen.has(cue.key))return false;this.seen.add(cue.key);if(this.queue.length>=3)this.queue.shift();this.queue.push(cue);return true;}
 event(game,event){this.bind(game);const cue=radioCue(game,event);if(cue&&event.type==='boss'&&!this.seen.has(cue.key)){this.queue=[];this.current=null;}return this.enqueue(cue);}
 sample(game,covered=false){this.bind(game);if(!this.current&&this.queue.length&&game.state==='playing')this.current={...this.queue.shift(),start:game.time};if(this.current&&game.time-this.current.start>=this.current.duration){this.current=null;return this.sample(game,covered);}return !covered&&game.state==='playing'&&this.current?{...this.current,remaining:Math.max(0,1-(game.time-this.current.start)/this.current.duration)}:null;}
}
export function createStoryRadio(onCue){
 const clock=new StoryRadioClock(),link=document.createElement('link');link.rel='stylesheet';link.href=new URL('./story-radio.css',import.meta.url).href;document.head.append(link);
 const panel=document.createElement('aside');panel.id='story-radio';panel.className='story-radio';panel.hidden=true;panel.setAttribute('aria-label','작전 무전');panel.innerHTML='<div class="radio-label"><span aria-hidden="true">▂▅▃▇▂</span><strong></strong><small>LIVE / 146.8</small></div><p aria-live="polite"></p><div class="radio-timer" aria-hidden="true"><i></i></div>';document.body.append(panel);let shown=null,shownGame=null,visible=false;
 return {event:(game,event)=>clock.event(game,event),update(game,covered=false){const cue=clock.sample(game,covered),changed=visible!==!!cue;visible=!!cue;panel.hidden=!cue;if(cue){const key=game.seed+':'+game.missionId+':'+cue.key;if(shown!==key||shownGame!==game){shown=key;shownGame=game;panel.querySelector('strong').textContent=cue.speaker;panel.querySelector('p').textContent=cue.text;onCue?.();}panel.querySelector('i').style.transform=`scaleX(${cue.remaining})`;}return changed;}};
}
