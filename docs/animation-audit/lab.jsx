// Audit-only fixtures: render existing components without changing game state.
import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { LazyMotion, domMax, MotionConfig } from 'motion/react';
import '/shared/src/index.css';
import perf from '/src/pages/PerfectRun.module.css';
import sheetCss from '/src/components/SquadSheet.module.css';
import PlayerCard from '/shared/src/components/PlayerCard.jsx';
import cards from '/shared/src/data/cards.json';
import PackRip from '/src/components/PackRip.jsx';
import SquadDock from '/src/components/SquadDock.jsx';
import SquadSheet from '/src/components/SquadSheet.jsx';
import SigningSequence from '/src/components/SigningSequence.jsx';
import MatchBackdrop from '/src/components/MatchBackdrop.jsx';
import TacticReturn from '/src/components/TacticReturn.jsx';
import { TacticCard } from '/src/components/SeriesCardTable.jsx';
import { TACTICS } from '/src/engine/endless/seriesCards.js';
import { flyTo, fallAway } from '/src/lib/flight.js';
import { flyBracketMoves } from '/src/lib/bracketFlight.js';
const roster=cards.filter(c=>c.rating>85).slice(0,5);
const tactic={uid:'audit-tactic',key:Object.keys(TACTICS)[0],source:'owned'};
function Lab(){
 const [scene,setScene]=useState('pack'),[rosterState,setRoster]=useState(roster),[igl,setIgl]=useState(roster[0].id),[sheet,setSheet]=useState(false),[release,setRelease]=useState(null),[result,setResult]=useState(''),[zoom,setZoom]=useState(1),[reaction,setReaction]=useState(null);
 useEffect(()=>{window.auditScene=name=>{setScene(name);setResult('');};window.auditAction=(name)=>{if(name==='igl')setIgl(roster[1].id);if(name==='sheet')setSheet(true);if(name==='release'){setRoster(roster.slice(0,4));setRelease({index:4,token:Date.now()})}if(name==='zoom'){setZoom(3);setReaction({kind:'shake',amplitude:5,key:Date.now()})}if(name==='mild')setReaction({kind:'shake',amplitude:1.5,key:Date.now()});if(name==='flight')flyTo(document.querySelector('#source'),document.querySelector('#target'),{onLand:()=>setResult('Landed')});if(name==='fall')fallAway(document.querySelector('#source'));if(name==='bracket'){const base=document.querySelector('#board'),overlay=document.querySelector('#overlay');flyBracketMoves({moves:[{id:'audit',fromEl:document.querySelector('#source'),toEl:document.querySelector('#target')}],base:base.getBoundingClientRect(),overlay,duration:600,onArrive:()=>setResult('Arrived')})}}});
 return <><header style={{position:'relative',zIndex:50,padding:24,background:'#10151f'}}><b>VFL ANIMATION AUDIT · COMPONENT FIXTURE · {scene.toUpperCase()}</b><p>Existing production components with controlled inputs. This is not a recorded game outcome.</p></header><main style={{position:'relative',padding:40,minHeight:650}}>
 {scene==='pack'&&<PackRip ripId={1} choices={roster} interactive={false} displayScale={.5}/>}
 {scene==='dock'&&<div style={{marginTop:300}}><SquadDock roster={rosterState} size={6} newSlotIndex={5} iglId={igl} squadName="Audit fixture" scale="large" onSwap={(a,b)=>setRoster(r=>{const n=[...r],i=n.findIndex(c=>c.id===a),j=n.findIndex(c=>c.id===b);[n[i],n[j]]=[n[j],n[i]];return n})} releaseSignal={release} activeIds={[roster[2].id]} onOpenSheet={()=>setSheet(true)}/></div>}
 {scene==='backdrop'&&<><MatchBackdrop active mode="live" kind="masters" variant={1} zoomLevel={zoom} reaction={reaction}/><h1 style={{position:'relative',marginTop:220,textAlign:'center'}}>Match backdrop fixture</h1></>}
 {['sign','tactic-win','tactic-loss'].includes(scene)&&<><div data-bank="pack" style={{position:'fixed',left:70,bottom:50,padding:20,background:'#ff4655'}}>PACK × 3</div><div data-empty-slot="0" data-tactic-slot={tactic.uid} style={{position:'fixed',right:80,bottom:50,width:100,height:145,border:'2px dashed white'}}>{scene==='sign'?'DOCK SLOT':<TacticCard instance={tactic} compact disabled/>}</div></>}
 {scene==='sign'&&<SigningSequence card={roster[0]} cost={2} picks={[]} openSlot onCommit={()=>{setScene('done');setResult('Signed')}} onCancel={()=>setScene('done')} reducedMotion={false} runSpeed="normal"/>}
 {scene.startsWith('tactic-')&&<TacticReturn card={tactic} won={scene==='tactic-win'} reducedMotion={false} runSpeed="normal" onDone={()=>{setScene('done');setResult('Tactic settled')}}/>}
 {scene==='flight'&&<div id="board" style={{position:'relative',height:500}}><div id="overlay" style={{position:'absolute',inset:0,pointerEvents:'none'}}/><div id="source" style={{position:'absolute',left:50,top:300,padding:30,background:'#ff4655'}}>WINNER / PRIZE</div><div id="target" style={{position:'absolute',left:900,top:50,padding:30,border:'2px solid #ff4655'}}>DESTINATION</div></div>}
 {scene==='samples'&&<div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:30}}>
 <section><h2>Result appearance</h2><div className={perf.revealed} style={{padding:30,background:'#242b38'}}>WINNER · 2–1</div></section>
 <section><h2>Scout deal</h2><div className={perf.scoutSpread} style={{position:'relative'}}><PlayerCard card={roster[0]} displayScale={.28}/></div></section>
 <section><h2>New desk slot</h2><div className={perf.squadDeskOpen} data-new="true">NEW SLOT</div></section>
 <section><h2>Specialty player pulse</h2><span className={perf.castPlayer} data-triggered="true"><b>{roster[0].player}</b><span className={perf.castTrigger}><b>+1.2 DUEL POWER</b><i>FLICK</i></span></span></section>
 <section><h2>Specialty score threshold</h2><div className={perf.castScore} data-specialty-active="true" style={{fontSize:44}}>12–12</div></section>
 <section><h2>Sheet card preview</h2><div style={{position:'relative',height:220}}><div className={sheetCss.preview} style={{bottom:'auto',top:0}}><PlayerCard card={roster[0]} displayScale={.28}/></div></div></section>
 <p style={{gridColumn:'1/-1'}}>CSS SPECIMENS · Actual production CSS on isolated sample markup. These show the named effects, not full game-trigger sequences.</p>
 </div>}<p style={{position:'relative'}}>{result}</p></main><SquadSheet open={sheet} onClose={()=>setSheet(false)} roster={rosterState} iglId={igl} squadName="Audit fixture" power={null}/></>;
}
createRoot(document.getElementById('root')).render(<LazyMotion features={domMax} strict><MotionConfig reducedMotion="user"><Lab/></MotionConfig></LazyMotion>);
