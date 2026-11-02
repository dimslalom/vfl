import useDeadline from '../lib/useDeadline';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { m } from 'motion/react';
import { DUR, EASE, STAGGER } from '../../shared/src/lib/motion';
import { flyBracketMoves } from '../lib/bracketFlight';
import HowTo from '../components/HowTo';
import LobbySeriesPrep, { SeriesReveal } from '../components/LobbySeriesPrep';
import ModeRail from '../components/ModeRail';
import OverviewRow from '../components/OverviewRow';
import RunReceipt from '../components/RunReceipt';
import Sheet from '../components/Sheet';
import CardFocusOverlay from '../components/CardFocusOverlay';
import SquadBar from '../components/SquadBar';
import SquadDock from '../components/SquadDock';
import SquadSheet from '../components/SquadSheet';
import PackRip from '../components/PackRip';
import TacticalButton from '../components/TacticalButton';
import Split from '../../shared/src/components/Split';
import cards from '../../shared/src/data/cards.json';
import { ROSTER_SIZE, teamPower } from '../../shared/src/engine/perfectRun';
import { connectLobby, createLobby, joinLobby, loadSession, makeCommand } from '../lib/multiplayerClient';
import { assetPath, countryName } from '../../shared/src/lib/utils';
import useReducedMotion from '../../shared/src/lib/useReducedMotion';
import styles from './Multiplayer.module.css';
import hub from '../styles/hub.module.css';
import soloStyles from './PerfectRun.module.css';
import { describeNews } from '../engine/endless/news';
import { t } from '../lib/i18n';
import { lobbyTurn } from '../lib/lobbyTurn';

const cardMap = new Map(cards.map(card => [card.id, card]));
// Stable empty-Set default so MultiplayerBracketCell's pending-arrival check
// never needs a fresh Set() on every render of every non-traveling cell.
const EMPTY_TEAM_ID_SET = new Set();

export default function Multiplayer() {
  const { code: routeCode } = useParams();
  const navigate = useNavigate();
  const [screen, setScreen] = useState(routeCode ? 'room' : 'menu');
  const [code, setCode] = useState(routeCode ?? '');
  const [name, setName] = useState('');
  const [settings, setSettings] = useState({ gameLength: 'year', unboxing: 'normal', seriesCards: true });
  const [session, setSession] = useState(() => routeCode ? loadSession(routeCode) : null);
  const [snapshot, setSnapshot] = useState(null);
  const [error, setError] = useState('');
  const [animationEvent, setAnimationEvent] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState('connecting');
  // Bumped by "Try again" to reopen a connection that gave up.
  const [connectAttempt, setConnectAttempt] = useState(0);
  const socketRef = useRef(null);
  const clearAnimation = useCallback(() => setAnimationEvent(null), []);

  useEffect(() => {
    if (!routeCode || !session?.sessionToken) return;
    let reconnectTimer;
    let stopped = false;
    let reconnectAttempt = 0;
    const open = () => {
      setConnectionStatus(reconnectAttempt ? 'reconnecting' : 'connecting');
      socketRef.current = connectLobby(routeCode, session.sessionToken, message => {
        if (message.snapshot) setSnapshot(message.snapshot);
        const roundEvent = message.events?.find(event => event.type === 'round_advance');
        if (roundEvent) setAnimationEvent(roundEvent);
        if (message.type === 'command_rejected') setError(t(message.message));
      }, nextStatus => {
        if (nextStatus === 'connected') {
          reconnectAttempt = 0;
          setConnectionStatus('connected');
          return;
        }
        if (stopped) return;
        if (nextStatus === 'error') setConnectionStatus('failed');
        if (nextStatus === 'disconnected') {
          reconnectAttempt += 1;
          setConnectionStatus(reconnectAttempt > 4 ? 'failed' : 'reconnecting');
          reconnectTimer = setTimeout(open, Math.min(1000 * 2 ** (reconnectAttempt - 1), 8000));
        }
      });
    };
    open();
    return () => {
      stopped = true;
      clearTimeout(reconnectTimer);
      socketRef.current?.close();
    };
  }, [routeCode, session?.sessionToken, connectAttempt]);

  async function handleCreate(event) {
    event.preventDefault();
    setError('');
    try {
      const result = await createLobby({ squadName: name, settings });
      setSession(result);
      navigate(`/lobby/${result.lobbyCode}`);
      setScreen('room');
    } catch (err) { setError(friendlyError(err.message)); }
  }

  async function handleJoin(event) {
    event.preventDefault();
    setError('');
    try {
      const normalized = code.toUpperCase();
      const result = await joinLobby(normalized, { squadName: name });
      setSession(result);
      navigate(`/lobby/${normalized}`);
      setScreen('room');
    } catch (err) { setError(friendlyError(err.message)); }
  }

  function send(type, payload) {
    if (!snapshot || socketRef.current?.readyState !== WebSocket.OPEN) {
      setError(t('The lobby is offline, so that was not sent. Wait for the connection to return, then try again.'));
      return;
    }
    setError('');
    socketRef.current.send(JSON.stringify(makeCommand(type, snapshot, payload)));
  }

  if (routeCode && !session) {
    return (
      <main className={styles.page}>
        <ModeRail />
        <section className={hub.column}>
          <div className={hub.title}>
            <h1 className={hub.titleText}>{t('Enter your')}<br /><em>{t('squad')}</em></h1>
          </div>
          <div className={hub.body}>
            <form className={styles.panel} onSubmit={handleJoin}>
              <h2>{t('Join lobby {code}', { code: routeCode })}</h2>
              <NameInput value={name} onChange={setName} />
              <button className={styles.primary}>{t('Join lobby')}</button>
            </form>
          </div>
          {error && <p className={styles.error} role="alert">{error}</p>}
        </section>
      </main>
    );
  }

  if (!routeCode || screen !== 'room') {
    return (
      <main className={styles.page}>
        <ModeRail />
        <section className={hub.column}>
          <div className={hub.title}>
            <h1 className={hub.titleText}>Gauntlet<br /><em>{t('Multiplayer')}</em></h1>
          </div>
          <div className={hub.body}>
            <form className={styles.panel} onSubmit={handleCreate}>
              <h2>{t('Create lobby')}</h2>
              <NameInput value={name} onChange={setName} />
              <Toggle label={t('Game length')} value={settings.gameLength} options={[['year', t('Year')], ['endless', t('Endless')]]} onChange={value => setSettings({ ...settings, gameLength: value })} />
              <Toggle label={t('Unboxing')} value={settings.unboxing} options={[['normal', t('Normal')], ['enc', t('National packs')]]} onChange={value => setSettings({ ...settings, unboxing: value })} />
              <Toggle label={t('Maps and tactics')} value={settings.seriesCards ? 'on' : 'off'} options={[['on', t('On')], ['off', t('Off')]]} onChange={value => setSettings({ ...settings, seriesCards: value === 'on' })} />
              <button className={styles.primary}>{t('Create private lobby')}</button>
            </form>
            <form className={styles.panel} onSubmit={handleJoin}>
              <h2>{t('Join lobby')}</h2>
              <label>{t('Lobby code')}<input value={code} onChange={event => setCode(event.target.value.replace(/[^a-z0-9]/gi, '').slice(0, 6).toUpperCase())} placeholder="ABC234" required /></label>
              <NameInput value={name} onChange={setName} />
              <button className={styles.primary}>{t('Join lobby')}</button>
            </form>
          </div>
          {error && <p className={styles.error} role="alert">{error}</p>}
        </section>
      </main>
    );
  }

  return <LobbyRoom onRetry={() => setConnectAttempt(value => value + 1)} onLeave={() => { setSnapshot(null); setScreen('menu'); navigate('/multiplayer'); }} snapshot={snapshot} session={session} error={error} send={send} animationEvent={animationEvent} clearAnimation={clearAnimation} connectionStatus={connectionStatus} />;
}

// The server answers in English and a player needs to know what to do next.
function friendlyError(message) {
  if (/not found/i.test(message)) return t('Lobby not found. Check the code with your host, or create a new lobby.');
  if (/failed to fetch|networkerror|request failed/i.test(message)) return t('Could not reach the server. Check your connection and try again.');
  return t(message);
}

function LobbyRoom({ snapshot, session, error, send, animationEvent, clearAnimation, connectionStatus, onRetry, onLeave }) {
  // Squad chip -> single-card focus overlay; SQUAD button / manual dismiss
  // of an optional pinned action. Declared unconditionally (Rules of Hooks)
  // even though the "connecting…" branch below doesn't need any of them yet.
  const [focusCard, setFocusCard] = useState(null);
  const [sheetTapOpen, setSheetTapOpen] = useState(false);
  const [sheetDismissed, setSheetDismissed] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);

  const myId = snapshot && (session.competitorId ?? session.spectatorId);
  const me = snapshot?.competitors.find(player => player.id === myId);
  const isHost = snapshot?.hostId === myId;
  const activeId = snapshot?.draft?.activeCompetitorId ?? snapshot?.consolation?.activeCompetitorId;
  const offers = snapshot?.phase === 'draft' ? snapshot.draft?.offers : snapshot?.consolation?.offers;
  const active = snapshot?.competitors.find(player => player.id === activeId);

  // My squad, always - regardless of whose turn it is. The draft/consolation
  // stage shows whoever is currently opening a pack (often not me); the dock
  // is a fixed "this is you", visible from the first pick through the
  // season's final standings.
  const dockRoster = me ? me.rosterIds.map(id => cardMap.get(id)).filter(Boolean) : [];
  const dockPower = dockRoster.length === ROSTER_SIZE ? teamPower(dockRoster, me?.iglId) : null;
  const dockVisible = Boolean(snapshot) && snapshot.phase !== 'lobby' && dockRoster.length > 0;

  // Consolation swaps reuse the same squad selection surface as IGL choice.
  const consolationSelected = snapshot?.phase === 'consolation' && activeId === myId && Boolean(snapshot.consolation?.selectedCardId);

  // Shaped for the SquadSheet contract - clicking an eligible card fires the
  // pick directly, no separate per-card button needed.
  const squadAction = snapshot?.phase === 'igl_select' && me
    ? {
        prompt: t('Choose your in-game leader'),
        onPick: (card) => send('choose_igl', { cardId: card.id }),
        isEligible: (card) => card.id !== me.iglId,
        dismissible: false,
        confirmPrompt: (card) => t('Name {player} as IGL?', { player: card.player }),
      }
    : consolationSelected
      ? {
          prompt: t('Who leaves'),
          onPick: (card) => send('choose_swap', { replaceCardId: card.id }),
          dismissible: true,
          confirmPrompt: (card) => t('Swap out {player}?', { player: card.player }),
        }
      : null;

  // Same three phase actions, shaped for the single-card focus overlay
  // (opened from a dock chip) instead - a button rather than a bare click,
  // matching the overlay's existing action/onAction contract.
  function chipActionLabel(card) {
    if (snapshot?.phase === 'igl_select' && me) {
      return card.id === me.iglId ? { label: t('Current IGL'), disabled: true } : { label: t('Name as IGL') };
    }
    if (consolationSelected) return { label: t('Swap out') };
    return null;
  }
  function runChipAction(card) {
    if (!card) return;
    if (snapshot?.phase === 'igl_select' && me) { if (card.id !== me.iglId) send('choose_igl', { cardId: card.id }); return; }
    if (consolationSelected) send('choose_swap', { replaceCardId: card.id });
  }

  // Identifies *which* pin is asking, so a dismiss can be scoped to it and a
  // dismissed sheet becomes pinnable again the moment the trigger changes.
  const pinTrigger = snapshot?.phase === 'igl_select' && me && !me.iglId
    ? 'igl'
    : consolationSelected
      ? `consolation:${snapshot.consolation.selectedCardId}`
      : null;

  // Adjusted during render (React's documented pattern for "reset on prop
  // change"), matching CardFocusOverlay's own flip-reset idiom.
  const prevPinTrigger = useRef(pinTrigger);
  if (prevPinTrigger.current !== pinTrigger) {
    prevPinTrigger.current = pinTrigger;
    if (sheetDismissed) setSheetDismissed(false);
  }
  const prevPhaseForSheet = useRef(snapshot?.phase);
  if (prevPhaseForSheet.current !== snapshot?.phase) {
    prevPhaseForSheet.current = snapshot?.phase;
    if (sheetTapOpen) setSheetTapOpen(false);
  }
  const sheetPinned = Boolean(pinTrigger) && !sheetDismissed;
  const sheetOpen = dockVisible && (sheetPinned || sheetTapOpen);

  function closeSquadSheet() {
    setSheetTapOpen(false);
    setSheetDismissed(true);
  }

  if (!snapshot) {
    return (
      <main className={styles.page}>
        <ModeRail />
        <div className={styles.loading} role="status">
          <p>{connectionStatus === 'failed' ? t('Could not connect to this lobby. It may have closed.') : connectionStatus === 'reconnecting' ? t('Reconnecting to lobby…') : t('Connecting to lobby…')}</p>
          {connectionStatus === 'failed' && (
            <div className={styles.loadingActions}>
              <TacticalButton className={styles.primary} onClick={onRetry}>{t('Try again')}</TacticalButton>
              <TacticalButton className={styles.secondary} onClick={onLeave}>{t('Back to multiplayer')}</TacticalButton>
            </div>
          )}
        </div>
      </main>
    );
  }

  // TimerBar is its own fixed bottom banner; when it's up, it sits ABOVE the
  // squad bar (see .timerDock's bottom offset) rather than the two competing
  // for the same strip, so the page needs to clear both stacked.
  const timerVisible = (snapshot.phase === 'match_ready' && !animationEvent && Boolean(snapshot.pendingTransition))
    || snapshot.phase === 'match_transition';

  return (
    <main className={[styles.page, dockVisible ? styles.withDock : '', timerVisible ? styles.withTimer : ''].join(' ')}>
      <ModeRail />
      <header className={styles.roomHeader}>
        <div><span className={styles.kicker}>{t('Private lobby')}</span><h1>{snapshot.code}</h1></div>
        {snapshot.season && <div className={styles.meta}><span>{t('Year {n}', { n: snapshot.season.year })}</span><span>{t('Tournament {n} / {total}', { n: snapshot.season.eventIndex + 1, total: 3 })}</span></div>}
      </header>
      {connectionStatus !== 'connected' && (
        <div className={styles.connection} role="status">
          <span>{connectionStatus === 'failed' ? t('Connection lost. Your squad is safe and the lobby keeps running.') : t('Reconnecting. Your picks are paused until the lobby is back.')}</span>
          {connectionStatus === 'failed' && <button type="button" className={styles.connectionRetry} onClick={onRetry}>{t('Try again')}</button>}
        </div>
      )}
      {error && <p className={styles.error} role="alert">{error}</p>}
      <TurnBanner snapshot={snapshot} myId={myId} />

      {snapshot.phase === 'lobby' && (
        <section className={styles.lobbySection}>
          <OverviewRow
            label={t('Lobby overview')}
            items={[
              { label: t('Players'), value: `${snapshot.competitors.length}/16` },
              { label: t('Length'), value: snapshot.settings.gameLength === 'endless' ? t('Endless') : t('Year') },
              { label: t('Draft'), value: snapshot.settings.unboxing === 'enc' ? t('National') : t('Normal') },
            ]}
          />
          <div className={styles.lobbyGrid}>
            <div><h2>{t('Competitors')}</h2><RosterList snapshot={snapshot} isHost={isHost} myId={myId} send={send} /></div>
            <aside className={styles.rules}>
              {isHost && (
                <TacticalButton className={styles.primary} disabled={snapshot.competitors.length < 2} onClick={() => send('start_game')}>
                  {snapshot.competitors.length < 2 ? t('Need one more squad') : t('Start game')}
                </TacticalButton>
              )}
              <TacticalButton className={styles.secondary} onClick={() => setRulesOpen(true)}>{t('How to play')}</TacticalButton>
              <p>{t('Share the code above. Anyone who joins after the start can watch.')}</p>
            </aside>
          </div>
          <Sheet open={rulesOpen} onClose={() => setRulesOpen(false)} title={t('How to play')}>
            <HowTo onDone={() => setRulesOpen(false)} />
          </Sheet>
        </section>
      )}

      {(snapshot.phase === 'draft' || snapshot.phase === 'consolation') && (
        <section className={styles.draftStage}>
          <span className={styles.kicker}>{snapshot.phase === 'draft' ? t('Draft pick {n} of {total}', { n: (snapshot.draft.turnIndex ?? 0) + 1, total: snapshot.draft.turns.length }) : t('Consolation pack')}</span>
          <h2>{t('{name} is opening', { name: active?.squadName ?? '' })}</h2>
          <MultiplayerDraftLane
            phase={snapshot.phase}
            turnIndex={snapshot.draft?.turnIndex ?? snapshot.consolation?.turnIndex ?? 0}
            totalTurns={snapshot.draft?.turns.length ?? snapshot.consolation?.order.length ?? 0}
            nation={snapshot.draft?.nation ?? snapshot.consolation?.nation}
            choices={(offers ?? []).map(id => cardMap.get(id)).filter(Boolean)}
            picks={active?.rosterIds.map(id => cardMap.get(id)).filter(Boolean) ?? []}
            selectedId={snapshot.consolation?.selectedCardId}
            interactive={activeId === myId}
            onPick={card => send('choose_card', { cardId: card.id })}
            squadName={active?.squadName ?? 'Squad'}
          />
          {snapshot.phase === 'consolation' && activeId === myId && <TacticalButton className={styles.secondary} onClick={() => send('skip_consolation')}>{t('Skip pack')}</TacticalButton>}
        </section>
      )}

      {snapshot.phase === 'igl_select' && (
        <section className={styles.draftStage}>
          <h2>{t('Choose your IGL')}</h2>
          {!me && <p>{t('Squads are choosing their in-game leaders.')}</p>}
        </section>
      )}

      {snapshot.phase === 'series_prep' && snapshot.seriesPrep && (
        <section className={styles.seriesStage}>
          <LobbySeriesPrep
            key={snapshot.seriesPrep.matchId}
            snapshot={snapshot}
            myId={myId}
            onSubmit={payload => send('series_submit', payload)}
          />
        </section>
      )}

      {(snapshot.phase === 'tournament' || snapshot.phase === 'match_ready' || snapshot.phase === 'match_transition') && snapshot.tournament && (
        <section className={styles.tournamentBoard}>
          <div className={styles.eventTitle}><span>{snapshot.tournament.meta.label}</span><b>{t(snapshot.tournament.rounds[snapshot.tournament.roundIdx].label)}</b></div>
          <div className={styles.tournamentOverview}><TournamentOverview snapshot={snapshot} myId={myId} /></div>
          {snapshot.phase === 'match_transition' && <SeriesReveal tournament={snapshot.tournament} matchId={snapshot.pendingTransition?.matchId} />}
          <MultiplayerBracket tournament={snapshot.tournament} animationEvent={animationEvent} onAnimationDone={clearAnimation} />
          {snapshot.settings.gameLength === 'endless' && isHost && <button className={styles.endless} onClick={() => send('end_endless')}>{t('End run after this tournament')}</button>}
        </section>
      )}

      {snapshot.settings.gameLength === 'endless' && <CircuitFeed world={snapshot.world} />}

      {snapshot.phase === 'season_over' && <Standings snapshot={snapshot} isHost={isHost} send={send} myId={myId} roster={dockRoster} />}
      {snapshot.phase === 'match_ready' && !animationEvent && snapshot.pendingTransition && <TimerBar label={t('Play match')} waitingLabel={t('Match starts')} pending={snapshot.pendingTransition} serverNow={snapshot.serverNow} isHost={isHost} onAdvance={() => send('advance_early')} />}
      {snapshot.phase === 'match_transition' && <TimerBar label={t('Play next match')} waitingLabel={t('Next match')} pending={snapshot.pendingTransition} serverNow={snapshot.serverNow} isHost={isHost} onAdvance={() => send('advance_early')} />}

      {dockVisible && (
        <SquadBar
          dock={(
            <SquadDock
              roster={dockRoster}
              size={ROSTER_SIZE}
              iglId={me?.iglId}
              squadName={me?.squadName}
              onFocusCard={setFocusCard}
              focusCardId={focusCard?.id ?? null}
              onOpenSheet={() => setSheetTapOpen(true)}
            />
          )}
        />
      )}

      {/* Clicking a dock chip opens it full size (and flippable) rather than
          firing the phase's action blind. */}
      <CardFocusOverlay
        card={focusCard}
        onClose={() => setFocusCard(null)}
        action={focusCard ? chipActionLabel(focusCard) : null}
        onAction={() => runChipAction(focusCard)}
      />

      {/* The full team scoreboard opens from the SQUAD button or when the
          current phase requires an IGL or consolation selection. */}
      <SquadSheet
        open={sheetOpen}
        onClose={closeSquadSheet}
        roster={dockRoster}
        iglId={me?.iglId}
        squadName={me?.squadName}
        power={dockPower}
        action={squadAction}
      />
    </main>
  );
}

// Your turn or theirs, the same way in every phase, with the clock beside it.
function TurnBanner({ snapshot, myId }) {
  const turn = lobbyTurn(snapshot, myId);
  const yours = {
    start: t('Your call: start when everyone is in'),
    draft: t('Your pick'),
    consolation: t('Your pack: keep a card or skip'),
    igl: t('Your move: choose your IGL'),
    series: t('Your move: pick maps, then tactics'),
    match: t('Your call: start the match'),
    next: t('Your call: move to the next match'),
    over: t('Your call: return everyone to the lobby'),
  };
  const waiting = turn.waitingOn.length
    ? t('Waiting on {names}', { names: turn.waitingOn.join(', ') })
    : t('Waiting');
  // The bar at the bottom already counts down these two.
  const showClock = turn.deadlineAt != null && !['match', 'next'].includes(turn.kind);
  return (
    <div className={styles.turn} data-mine={turn.mine ? 'true' : undefined} role="status">
      <b>{turn.mine ? yours[turn.kind] ?? t('Your move') : waiting}</b>
      {showClock && <Deadline key={turn.deadlineAt} deadlineAt={turn.deadlineAt} serverNow={snapshot.serverNow} />}
    </div>
  );
}

function TournamentOverview({ snapshot, myId }) {
  const rows = Object.values(snapshot.season.standings).sort((a, b) => b.score - a.score || b.titles - a.titles);
  const index = rows.findIndex(row => row.competitorId === myId);
  const row = rows[Math.max(0, index)];
  return (
    <OverviewRow
      label={t('Standings overview')}
      items={[
        { label: index >= 0 ? t('Your place') : t('Leader'), value: index >= 0 ? `${index + 1}/${rows.length}` : row.squadName },
        { label: t('Titles'), value: row.titles },
        { label: t('Score'), value: row.score.toLocaleString() },
      ]}
    />
  );
}

function RosterList({ snapshot, isHost, myId, send }) {
  return <div className={styles.rosterList}>{snapshot.competitors.map((player, index) => <div key={player.id} className={styles.rosterRow}><span>{index + 1}</span><b><Split parts={[player.squadName, player.id === myId && <em>{t('You')}</em>]} /></b><i className={player.connected ? styles.online : styles.offline}>{player.connected ? t('online') : t('offline')}</i>{player.id === snapshot.hostId && <em>{t('Host')}</em>}{isHost && player.id !== myId && snapshot.phase === 'lobby' && <button onClick={() => send('kick_player', { competitorId: player.id })}>{t('Remove')}</button>}</div>)}</div>;
}

// The lobby's shared world, as news. There is one card pool and one
// development map here, so this feed is the same for every competitor - a
// rival's signing takes that player off YOUR board too, and seeing it is what
// makes the pool feel contested rather than merely random.
function CircuitFeed({ world }) {
  const items = world?.feed ?? [];
  if (!items.length) return null;
  return (
    <section className={styles.circuitFeed}>
      <span className={styles.circuitFeedHead}><Split parts={[t('Around the circuit'), t('Year {n}', { n: world.year })]} /></span>
      <ul className={styles.circuitFeedList}>
        {items.slice(0, 6).map((item, i) => {
          const { title, note } = describeNews(item);
          return (
            <li key={`${item.y}-${item.t}-${i}`} className={styles.circuitFeedRow}>
              <span className={styles.circuitFeedTitle}>{title}</span>
              <span className={styles.circuitFeedNote}>{note}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Standings({ snapshot, isHost, send, myId, roster }) {
  const rows = Object.values(snapshot.season.standings).sort((a, b) => b.score - a.score || b.titles - a.titles);
  const place = rows.findIndex(row => row.competitorId === myId);
  const mine = rows[place] ?? null;
  return (
    <section className={styles.standings}>
      <span className={styles.kicker}>{t('Season complete')}</span>
      <h1>{t('Final standings')}</h1>
      {/* Parity with Gauntlet's TournamentResult history rows - same
          tokenized entrance and stagger, snapping the final order into
          place one row at a time instead of dumping the whole table at
          once. */}
      {rows.map((row, index) => (
        <m.div
          key={row.competitorId}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: DUR.enter, ease: EASE.out, delay: index * STAGGER }}
        >
          <span>{index + 1}</span>
          <b>{row.squadName}</b>
          <span>{snapshot.settings.gameLength === 'endless' ? <Split parts={[t('{n} years', { n: row.yearsCompleted }), t('{n} titles', { n: row.titles })]} /> : t('{n} titles', { n: row.titles })}</span>
          <span>{t('{n} wins', { n: row.matchWins })}</span>
          <strong>{row.score}</strong>
        </m.div>
      ))}
      {mine && (
        <div className={styles.receiptSlot}>
          <RunReceipt
            title={mine.squadName}
            kicker={t('Multiplayer')}
            stats={[
              { label: t('Place'), value: `${place + 1}/${rows.length}` },
              { label: t('Score'), value: mine.score.toLocaleString() },
              { label: t('Titles'), value: mine.titles },
              { label: t('Match wins'), value: mine.matchWins },
            ]}
            players={roster}
            url={window.location.origin}
            fileName="gauntlet-lobby.png"
          />
        </div>
      )}
      {isHost && <TacticalButton className={styles.primary} onClick={() => send('return_to_lobby')}>{t('Return everyone to lobby')}</TacticalButton>}
    </section>
  );
}

function MultiplayerDraftLane({ phase, turnIndex, totalTurns, nation, choices, picks, selectedId, interactive, onPick, squadName }) {
  const ripId = `${phase}:${turnIndex}:${choices.map(card => card.id).join(',')}`;
  return (
    <PackRip
      ripId={ripId}
      nation={nation}
      packTitle={nation ? countryName(nation) : t('Five card pack')}
      choices={choices}
      interactive={interactive}
      onPick={onPick}
      selectedId={selectedId}
      displayScale={0.45}
      headerLabel={squadName}
      headerSlot={phase === 'draft'
        ? t('Pick {n} of {total}', { n: Math.min(picks.length + 1, ROSTER_SIZE), total: ROSTER_SIZE })
        : t('Pack {n} of {total}', { n: turnIndex + 1, total: totalTurns })}
      className={styles.multiplayerLane}
    />
  );
}

function MultiplayerBracket({ tournament, animationEvent, onAnimationDone }) {
  const refs = useRef({});
  const overlayRef = useRef(null);
  const wrapRef = useRef(null);
  const reducedMotion = useReducedMotion();
  // "destinationSlot:teamId" pairs currently mid-flight - that exact
  // destination cell renders "TBD" until its own clone lands, same idiom as
  // Gauntlet's solo bracket. Keyed by slot+team, not bare team id: a
  // winner's id also already sits in its OLD round's cell (the match it
  // just won, still on screen one column back) - a bare-id Set would mask
  // that already-decided source cell too, since the same id legitimately
  // appears in both places.
  const [pendingArrivalIds, setPendingArrivalIds] = useState(EMPTY_TEAM_ID_SET);

  useLayoutEffect(() => {
    if (!animationEvent?.moves?.length) return undefined;
    if (reducedMotion) { onAnimationDone(); return undefined; }
    const wrap = wrapRef.current;
    const overlay = overlayRef.current;
    const base = wrap?.getBoundingClientRect();
    if (!wrap || !overlay || !base) { onAnimationDone(); return undefined; }
    setPendingArrivalIds(new Set(animationEvent.moves.map(move => `${move.destinationSlot}:${move.teamId}`)));

    const flightMoves = animationEvent.moves.map(move => ({
      id: `${move.destinationSlot}:${move.teamId}`,
      fromEl: refs.current[move.sourceSlot]?.querySelector(`[data-team-id="${CSS.escape(move.teamId)}"]`),
      toEl: refs.current[move.destinationSlot]?.querySelector(`[data-team-id="${CSS.escape(move.teamId)}"]`),
      cloneClass: soloStyles.travelClone,
    }));

    const flight = flyBracketMoves({
      moves: flightMoves,
      base,
      overlay,
      duration: DUR.travel * 1000,
      reducedMotion,
      onArrive: (arrivalKey) => {
        setPendingArrivalIds(prev => {
          if (!prev.has(arrivalKey)) return prev;
          const next = new Set(prev);
          next.delete(arrivalKey);
          return next;
        });
      },
    });

    flight.finished.then(() => {
      setPendingArrivalIds(EMPTY_TEAM_ID_SET);
      onAnimationDone();
    });
    return () => flight.cancel();
  }, [animationEvent, onAnimationDone, reducedMotion]);

  const byKey = key => tournament.rounds.find(round => round.key === key);
  const r16 = byKey('r16');
  const quarter = byKey('quarter');
  const semi = byKey('semi');
  const final = byKey('final');
  const cell = (round, index, key) => (
    <MultiplayerBracketCell
      tournament={tournament}
      match={round?.matches[index]}
      pendingArrivalIds={pendingArrivalIds}
      cellKey={`${key}:${index}`}
      cellRef={element => { refs.current[`${key}:${index}`] = element; }}
    />
  );
  const slot = (column, rowStart, rowEnd, child, key) => (
    <div key={key} className={soloStyles.bracketSlot} style={{ gridColumn: column, gridRow: `${rowStart} / ${rowEnd}` }}>{child}</div>
  );
  const connector = (column, rowStart, rowEnd, key) => (
    <div key={key} className={soloStyles.conn} style={{ gridColumn: column, gridRow: `${rowStart} / ${rowEnd}` }} />
  );

  return (
    <div className={soloStyles.bracketWrap} ref={wrapRef}>
      <div className={soloStyles.bracket}>
        <span className={soloStyles.poolLabel} style={{ gridColumn: 1, gridRow: 1 }}>{t('Round of 16')}</span>
        <span className={soloStyles.poolLabel} style={{ gridColumn: 3, gridRow: 1 }}>{t('Quarterfinals')}</span>
        <span className={soloStyles.poolLabel} style={{ gridColumn: 5, gridRow: 1 }}>{t('Semifinals')}</span>
        <span className={soloStyles.poolLabel} style={{ gridColumn: 7, gridRow: 1 }}>{t('Grand Final')}</span>
        {[0, 1, 2, 3, 4, 5, 6, 7].map(index => slot(1, index + 2, index + 3, cell(r16, index, 'r16'), `r16-${index}`))}
        {[0, 1, 2, 3].map(index => connector(2, 2 * index + 2, 2 * index + 4, `c2-${index}`))}
        {[0, 1, 2, 3].map(index => slot(3, 2 * index + 2, 2 * index + 4, cell(quarter, index, 'quarter'), `qf-${index}`))}
        {[0, 1].map(index => connector(4, 4 * index + 2, 4 * index + 6, `c4-${index}`))}
        {[0, 1].map(index => slot(5, 4 * index + 2, 4 * index + 6, cell(semi, index, 'semi'), `sf-${index}`))}
        {connector(6, 2, 10, 'c6')}
        {slot(7, 2, 10, cell(final, 0, 'final'), 'gf')}
      </div>
      <div className={soloStyles.travelOverlay} ref={overlayRef} aria-hidden="true" />
    </div>
  );
}

function MultiplayerBracketCell({ tournament, match, pendingArrivalIds = EMPTY_TEAM_ID_SET, cellKey, cellRef }) {
  if (!match) {
    return (
      <div className={soloStyles.bracketCell} ref={cellRef}>
        <div className={soloStyles.bracketTeam}><span className={soloStyles.cellTag}>TBD</span></div>
        <div className={soloStyles.bracketTeam}><span className={soloStyles.cellTag}>TBD</span></div>
      </div>
    );
  }
  const revealed = Boolean(match.winner);
  // A team mid-flight to this slot renders as TBD until its own clone lands
  // - data-team-id stays put either way so the travel effect's querySelector
  // still finds this row to measure and animate toward. Checked as
  // "thisCellKey:teamId", not bare teamId: a winner's id also already sits
  // in its OLD round's cell one column back (the match it just won), and a
  // bare-id check would mask that already-decided cell too.
  const row = (teamId, score) => {
    const team = tournament.teams[teamId];
    const winner = revealed && match.winner === teamId;
    const pending = pendingArrivalIds.has(`${cellKey}:${teamId}`);
    return (
      <div
        key={teamId}
        data-team-id={teamId}
        className={[soloStyles.bracketTeam, winner ? soloStyles.cellWon : '', revealed && !winner ? soloStyles.cellLost : '', team.human ? soloStyles.bracketYou : ''].join(' ')}
      >
        {pending ? (
          <span className={soloStyles.cellTag}>TBD</span>
        ) : (
          <>
            {team.logo ? <img src={assetPath(team.logo)} alt="" /> : <span className={soloStyles.youMark}>★</span>}
            <span className={soloStyles.cellSeed}>{tournament.seeds.indexOf(teamId) + 1}</span>
            <span className={soloStyles.cellTag}>{team.tag}</span>
            <span className={soloStyles.bracketScore} data-bracket-score>{revealed ? score : ''}</span>
          </>
        )}
      </div>
    );
  };
  return (
    <div className={[soloStyles.bracketCell, match.humanInvolved ? soloStyles.playerMatch : '', revealed ? soloStyles.revealed : ''].join(' ')} ref={cellRef}>
      {row(match.a, match.scoreA)}
      {row(match.b, match.scoreB)}
    </div>
  );
}

function TimerBar({ label, waitingLabel, pending, serverNow, isHost, onAdvance }) {
  const { seconds, progress } = useDeadline(pending.deadlineAt, serverNow);
  return <div className={styles.timerDock}><m.button onClick={isHost ? onAdvance : undefined} disabled={!isHost} style={{ '--remaining': progress }}><Split parts={[isHost ? label : waitingLabel, `${seconds}s`]} /></m.button></div>;
}

function Deadline({ deadlineAt, serverNow }) {
  const { seconds } = useDeadline(deadlineAt, serverNow, 30_000);
  return <span className={styles.deadline}>{t('{n}s left', { n: seconds })}</span>;
}

function NameInput({ value, onChange }) { return <label>{t('Squad name')}<input value={value} onChange={event => onChange(event.target.value.slice(0, 28))} maxLength={28} placeholder="Brisbane Bandits" required /></label>; }

function Toggle({ label, value, options, onChange }) { return <fieldset><legend>{label}</legend><div className={styles.toggle}>{options.map(([key, text]) => <button type="button" key={key} className={value === key ? styles.active : ''} onClick={() => onChange(key)}>{text}</button>)}</div></fieldset>; }
