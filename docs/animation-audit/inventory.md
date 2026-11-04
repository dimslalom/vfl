# VFL animation source inventory

Every matching declaration/call site in app and shared source, including legacy and unused definitions. This is source coverage, not a claim that each effect was played. Generated 2 November 2026.

137 source files scanned; 262 motion-related lines; 32 named CSS keyframe definitions. Per-card instances and tier variants share definitions. Comments and dependencies excluded. Timer calls are included for investigation; not all are animations.

## Named keyframes

| Effect | Source |
|---|---|
| flipShadow | [shared/src/components/PlayerCard.module.css:85](../../shared/src/components/PlayerCard.module.css) |
| flipShadowBack | [shared/src/components/PlayerCard.module.css:90](../../shared/src/components/PlayerCard.module.css) |
| wristFlip | [shared/src/components/PlayerCard.module.css:177](../../shared/src/components/PlayerCard.module.css) |
| wristFlipBack | [shared/src/components/PlayerCard.module.css:183](../../shared/src/components/PlayerCard.module.css) |
| flipFlash | [shared/src/components/PlayerCard.module.css:189](../../shared/src/components/PlayerCard.module.css) |
| flipFlashBack | [shared/src/components/PlayerCard.module.css:195](../../shared/src/components/PlayerCard.module.css) |
| imageIn | [src/components/MatchBackdrop.module.css:55](../../src/components/MatchBackdrop.module.css) |
| packFloat | [src/components/PackRip.module.css:128](../../src/components/PackRip.module.css) |
| rarityJolt | [src/components/PackRip.module.css:132](../../src/components/PackRip.module.css) |
| packStageJolt | [src/components/PackRip.module.css:137](../../src/components/PackRip.module.css) |
| edgeFlash | [src/components/PackRip.module.css:142](../../src/components/PackRip.module.css) |
| activeCardBeat | [src/components/SquadDock.module.css:142](../../src/components/SquadDock.module.css) |
| dropWarning | [src/components/SquadDock.module.css:150](../../src/components/SquadDock.module.css) |
| iglStamp | [src/components/SquadDock.module.css:196](../../src/components/SquadDock.module.css) |
| iglShockwave | [src/components/SquadDock.module.css:201](../../src/components/SquadDock.module.css) |
| chipRise | [src/components/SquadDock.module.css:311](../../src/components/SquadDock.module.css) |
| slotDeal | [src/components/SquadDock.module.css:402](../../src/components/SquadDock.module.css) |
| slotDealEdge | [src/components/SquadDock.module.css:420](../../src/components/SquadDock.module.css) |
| slotAlert | [src/components/SquadDock.module.css:452](../../src/components/SquadDock.module.css) |
| previewRise | [src/components/SquadSheet.module.css:44](../../src/components/SquadSheet.module.css) |
| faceIn | [src/components/SquadSheet.module.css:190](../../src/components/SquadSheet.module.css) |
| fadeIn | [src/components/SquadSheet.module.css:251](../../src/components/SquadSheet.module.css) |
| riseIn | [src/pages/PerfectRun.module.css:257](../../src/pages/PerfectRun.module.css) |
| landingFanIn | [src/pages/PerfectRun.module.css:261](../../src/pages/PerfectRun.module.css) |
| landingFanInMobile | [src/pages/PerfectRun.module.css:265](../../src/pages/PerfectRun.module.css) |
| resultIn | [src/pages/PerfectRun.module.css:716](../../src/pages/PerfectRun.module.css) |
| scoutDeal | [src/pages/PerfectRun.module.css:846](../../src/pages/PerfectRun.module.css) |
| heroIn | [src/pages/PerfectRun.module.css:1372](../../src/pages/PerfectRun.module.css) |
| specialtyCardPulse | [src/pages/PerfectRun.module.css:1565](../../src/pages/PerfectRun.module.css) |
| specialtyChip | [src/pages/PerfectRun.module.css:1569](../../src/pages/PerfectRun.module.css) |
| specialtyThreshold | [src/pages/PerfectRun.module.css:1574](../../src/pages/PerfectRun.module.css) |
| slotArrive | [src/pages/PerfectRun.module.css:2764](../../src/pages/PerfectRun.module.css) |

## Every motion-related source line

- [shared/src/components/PackTear.jsx:65](../../shared/src/components/PackTear.jsx): `animeAnimate(bodyRef.current, { translateY: 60, rotateX: 25, opacity: [1, 0], duration: MS.enter, ease: ANIME_EASE.in });`
- [shared/src/components/PackTear.jsx:81](../../shared/src/components/PackTear.jsx): `flapRef.current.animate(`
- [shared/src/components/PackTear.jsx:108](../../shared/src/components/PackTear.jsx): `if (k < 1) requestAnimationFrame(step);`
- [shared/src/components/PackTear.jsx:111](../../shared/src/components/PackTear.jsx): `requestAnimationFrame(step);`
- [shared/src/components/PackTear.module.css:2](../../shared/src/components/PackTear.module.css): `effect didn't need to touch .strip's layout math. .packWrap is the only`
- [shared/src/components/PlayerCard.jsx:97](../../shared/src/components/PlayerCard.jsx): `layoutId={layoutId}`
- [shared/src/components/PlayerCard.jsx:104](../../shared/src/components/PlayerCard.jsx): `whileTap={onClick ? { scale: pressScale } : undefined}`
- [shared/src/components/PlayerCard.module.css:78](../../shared/src/components/PlayerCard.module.css): `animation: flipShadow var(--dur-hero) var(--ease-out) both;`
- [shared/src/components/PlayerCard.module.css:82](../../shared/src/components/PlayerCard.module.css): `animation: flipShadowBack var(--dur-hero) var(--ease-out) both;`
- [shared/src/components/PlayerCard.module.css:85](../../shared/src/components/PlayerCard.module.css): `@keyframes flipShadow {`
- [shared/src/components/PlayerCard.module.css:90](../../shared/src/components/PlayerCard.module.css): `@keyframes flipShadowBack {`
- [shared/src/components/PlayerCard.module.css:141](../../shared/src/components/PlayerCard.module.css): `transition: transform var(--dur-hero) var(--ease-out);`
- [shared/src/components/PlayerCard.module.css:151](../../shared/src/components/PlayerCard.module.css): `animation: wristFlip var(--dur-hero) var(--ease-out) both;`
- [shared/src/components/PlayerCard.module.css:155](../../shared/src/components/PlayerCard.module.css): `animation: wristFlipBack var(--dur-hero) var(--ease-out) both;`
- [shared/src/components/PlayerCard.module.css:170](../../shared/src/components/PlayerCard.module.css): `animation: flipFlash var(--dur-micro) linear var(--flip-flash-delay) both;`
- [shared/src/components/PlayerCard.module.css:174](../../shared/src/components/PlayerCard.module.css): `animation: flipFlashBack var(--dur-micro) linear var(--flip-flash-delay) both;`
- [shared/src/components/PlayerCard.module.css:177](../../shared/src/components/PlayerCard.module.css): `@keyframes wristFlip {`
- [shared/src/components/PlayerCard.module.css:183](../../shared/src/components/PlayerCard.module.css): `@keyframes wristFlipBack {`
- [shared/src/components/PlayerCard.module.css:189](../../shared/src/components/PlayerCard.module.css): `@keyframes flipFlash {`
- [shared/src/components/PlayerCard.module.css:195](../../shared/src/components/PlayerCard.module.css): `@keyframes flipFlashBack {`
- [shared/src/components/PlayerCard.module.css:225](../../shared/src/components/PlayerCard.module.css): `transition: transform var(--dur-hover) var(--ease-out);`
- [shared/src/components/PlayerCard.module.css:287](../../shared/src/components/PlayerCard.module.css): `transition: opacity var(--dur-transform) var(--ease-out);`
- [shared/src/components/PlayerCard.module.css:311](../../shared/src/components/PlayerCard.module.css): `.flip,.flip[data-flipped="true"] { animation:none; transition:opacity var(--dur-micro); transform:rotateY(var(--flip,0deg)); }`
- [shared/src/components/PlayerCard.module.css:346](../../shared/src/components/PlayerCard.module.css): `transition: background 0.14s ease, color 0.14s ease;`
- [shared/src/components/PlayerCard.module.css:367](../../shared/src/components/PlayerCard.module.css): `transition: opacity 0.14s ease, transform 0.14s ease;`
- [shared/src/components/PlayerCard.module.css:552](../../shared/src/components/PlayerCard.module.css): `transition: none;`
- [shared/src/index.css:69](../../shared/src/index.css): `transition: background var(--dur-micro), color var(--dur-micro),`
- [shared/src/index.css:128](../../shared/src/index.css): `animation-duration: 0.01ms !important;`
- [shared/src/index.css:134](../../shared/src/index.css): `animation-delay: 0ms !important;`
- [shared/src/lib/anime.js:43](../../shared/src/lib/anime.js): `animate(el, {`
- [shared/src/lib/motion.js:33](../../shared/src/lib/motion.js): `animate: { opacity: 1, y: 0, transition: { duration: DUR.hero, ease: EASE.out } },`
- [shared/src/lib/motion.js:34](../../shared/src/lib/motion.js): `exit: { opacity: 0, transition: { duration: DUR.hover, ease: EASE.in } },`
- [shared/src/lib/motion.js:39](../../shared/src/lib/motion.js): `animate: { opacity: 1, transition: { duration: DUR.enter, ease: EASE.out } },`
- [shared/src/lib/motion.js:40](../../shared/src/lib/motion.js): `exit: { opacity: 0, transition: { duration: DUR.hover, ease: EASE.in } },`
- [shared/src/lib/motion.js:46](../../shared/src/lib/motion.js): `animate: { opacity: 1, y: 0, transition: { duration: DUR.transform, ease: EASE.out } },`
- [shared/src/lib/motion.js:47](../../shared/src/lib/motion.js): `exit: { opacity: 0, y: 16, transition: { duration: DUR.hover, ease: EASE.in } },`
- [shared/src/lib/motion.js:54](../../shared/src/lib/motion.js): `animate: { opacity: 1, y: 0, transition: { duration: DUR.transform, ease: EASE.out } },`
- [shared/src/lib/motion.js:55](../../shared/src/lib/motion.js): `exit: { opacity: 0, transition: { duration: DUR.micro, ease: EASE.in } },`
- [shared/src/lib/motion.js:62](../../shared/src/lib/motion.js): `animate: { opacity: 1, y: 0, transition: { duration: DUR.enter, ease: EASE.out } },`
- [shared/src/lib/motion.js:63](../../shared/src/lib/motion.js): `exit: { opacity: 0, y: -4, transition: { duration: DUR.transform, ease: EASE.in } },`
- [shared/src/lib/motion.js:84](../../shared/src/lib/motion.js): `transition: cardSpringSoft,`
- [shared/src/lib/motion.js:96](../../shared/src/lib/motion.js): `transition: { duration: 0.18, ease: EASE.out },`
- [shared/src/lib/motion.js:108](../../shared/src/lib/motion.js): `transition: { duration: DUR.hero, ease: EASE.out },`
- [shared/src/lib/motion.js:126](../../shared/src/lib/motion.js): `transition: { ...cardSpringSoft, opacity: { duration: DUR.transform } },`
- [shared/src/lib/motion.js:137](../../shared/src/lib/motion.js): `transition: { ...cardSpring, opacity: { duration: DUR.transform } },`
- [shared/src/lib/motion.js:143](../../shared/src/lib/motion.js): `animate: { opacity: 1, x: 0, y: 0, transition: { ...cardSpring, opacity: { duration: DUR.transform } } },`
- [shared/src/lib/useCardTilt.js:59](../../shared/src/lib/useCardTilt.js): `if (moving) frameRef.current = requestAnimationFrame(tick);`
- [shared/src/lib/useCardTilt.js:62](../../shared/src/lib/useCardTilt.js): `frameRef.current = requestAnimationFrame(tick);`
- [src/App.jsx:31](../../src/App.jsx): `{/* LayoutGroup at the root so layoutId survives createPortal - React`
- [src/components/CardFocusOverlay.jsx:79](../../src/components/CardFocusOverlay.jsx): `requestAnimationFrame(() => {`
- [src/components/CardFocusOverlay.jsx:110](../../src/components/CardFocusOverlay.jsx): `initial="initial"`
- [src/components/CardFocusOverlay.jsx:111](../../src/components/CardFocusOverlay.jsx): `animate="animate"`
- [src/components/CardFocusOverlay.jsx:112](../../src/components/CardFocusOverlay.jsx): `exit="exit"`
- [src/components/CardFocusOverlay.jsx:133](../../src/components/CardFocusOverlay.jsx): `layoutId={releasingId === card.id ? undefined : card-${card.id}}`
- [src/components/CardFocusOverlay.module.css:40](../../src/components/CardFocusOverlay.module.css): `transition: opacity var(--dur-hover) var(--ease-out);`
- [src/components/CardFocusOverlay.module.css:205](../../src/components/CardFocusOverlay.module.css): `transition: background var(--dur-micro), color var(--dur-micro);`
- [src/components/CardFocusOverlay.module.css:232](../../src/components/CardFocusOverlay.module.css): `transition: transform var(--dur-hover);`
- [src/components/CardReveal.jsx:23](../../src/components/CardReveal.jsx): `initial={reducedMotion ? { opacity: 0 } : variant.initial}`
- [src/components/CardReveal.jsx:24](../../src/components/CardReveal.jsx): `animate={reducedMotion`
- [src/components/CardReveal.jsx:25](../../src/components/CardReveal.jsx): `? { opacity: 1, transition: { duration: DUR.micro, ease: EASE.out } }`
- [src/components/CardReveal.jsx:28](../../src/components/CardReveal.jsx): `transition: { ...variant.animate.transition, delay: baseDelay + index * PACK_STAGGER },`
- [src/components/DeckBuilder.module.css:124](../../src/components/DeckBuilder.module.css): `transition: transform var(--dur-transform) var(--ease-out);`
- [src/components/DeckBuilder.module.css:213](../../src/components/DeckBuilder.module.css): `transition: color var(--dur-micro), border-color var(--dur-micro);`
- [src/components/DeckBuilder.module.css:323](../../src/components/DeckBuilder.module.css): `transition: transform var(--dur-transform);`
- [src/components/DeckBuilder.module.css:341](../../src/components/DeckBuilder.module.css): `transition: opacity var(--dur-hover);`
- [src/components/Desk.module.css:24](../../src/components/Desk.module.css): `transition: background var(--dur-micro);`
- [src/components/Desk.module.css:42](../../src/components/Desk.module.css): `transition: color var(--dur-micro), background var(--dur-micro);`
- [src/components/Landing.jsx:248](../../src/components/Landing.jsx): `const raf = requestAnimationFrame(() => setN(value ?? 0));`
- [src/components/Landing.jsx:257](../../src/components/Landing.jsx): `if (k < 1) raf = requestAnimationFrame(step);`
- [src/components/Landing.jsx:259](../../src/components/Landing.jsx): `raf = requestAnimationFrame(step);`
- [src/components/LanguagePicker.module.css:12](../../src/components/LanguagePicker.module.css): `transition: color var(--dur-micro), background var(--dur-micro);`
- [src/components/MatchBackdrop.jsx:58](../../src/components/MatchBackdrop.jsx): `transition: { duration: reducedMotion ? 0 : ZOOM_DURATION, ease: ZOOM_EASE },`
- [src/components/MatchBackdrop.jsx:71](../../src/components/MatchBackdrop.jsx): `transition: { duration, ease: 'easeInOut' },`
- [src/components/MatchBackdrop.jsx:84](../../src/components/MatchBackdrop.jsx): `initial={{ scale: ZOOM_SCALE[zoomLevel] ?? ZOOM_SCALE[1] }}`
- [src/components/MatchBackdrop.jsx:85](../../src/components/MatchBackdrop.jsx): `animate={controls}`
- [src/components/MatchBackdrop.jsx:96](../../src/components/MatchBackdrop.jsx): `initial={{ opacity: 0.78 }}`
- [src/components/MatchBackdrop.jsx:97](../../src/components/MatchBackdrop.jsx): `animate={{ opacity: 0 }}`
- [src/components/MatchBackdrop.jsx:98](../../src/components/MatchBackdrop.jsx): `exit={{ opacity: 0 }}`
- [src/components/MatchBackdrop.module.css:30](../../src/components/MatchBackdrop.module.css): `animation: imageIn 700ms ease both;`
- [src/components/MatchBackdrop.module.css:55](../../src/components/MatchBackdrop.module.css): `@keyframes imageIn {`
- [src/components/ModeRail.jsx:70](../../src/components/ModeRail.jsx): `whileHover={{ scale: 1.05 }}`
- [src/components/ModeRail.jsx:71](../../src/components/ModeRail.jsx): `whileTap={{ scale: 0.92 }}`
- [src/components/ModeRail.module.css:44](../../src/components/ModeRail.module.css): `transition: color var(--dur-micro), background var(--dur-micro);`
- [src/components/ModeRail.module.css:78](../../src/components/ModeRail.module.css): `transition: opacity var(--dur-micro);`
- [src/components/ModeRail.module.css:100](../../src/components/ModeRail.module.css): `transition: color var(--dur-micro), background var(--dur-micro);`
- [src/components/PackRip.jsx:98](../../src/components/PackRip.jsx): `const animation = animeAnimate(container, {`
- [src/components/PackRip.jsx:230](../../src/components/PackRip.jsx): `animate(x, 0, { ...cardSpring, onComplete: () => setGhostRect(null) }),`
- [src/components/PackRip.jsx:231](../../src/components/PackRip.jsx): `animate(y, 0, cardSpring),`
- [src/components/PackRip.jsx:232](../../src/components/PackRip.jsx): `animate(rotate, 0, cardSpring),`
- [src/components/PackRip.jsx:346](../../src/components/PackRip.jsx): `layoutId={dropTarget === 'chip' ? undefined : card-${card.id}}`
- [src/components/PackRip.module.css:106](../../src/components/PackRip.module.css): `animation: packFloat var(--pack-wave-period) ease-in-out var(--wave-delay, var(--pack-wave-start)) infinite;`
- [src/components/PackRip.module.css:109](../../src/components/PackRip.module.css): `animation:`
- [src/components/PackRip.module.css:122](../../src/components/PackRip.module.css): `animation: edgeFlash var(--dur-micro) linear var(--pack-impact-delay) 1;`
- [src/components/PackRip.module.css:125](../../src/components/PackRip.module.css): `animation: packStageJolt var(--dur-micro) steps(2, end) var(--pack-impact-delay) 1;`
- [src/components/PackRip.module.css:128](../../src/components/PackRip.module.css): `@keyframes packFloat {`
- [src/components/PackRip.module.css:132](../../src/components/PackRip.module.css): `@keyframes rarityJolt {`
- [src/components/PackRip.module.css:137](../../src/components/PackRip.module.css): `@keyframes packStageJolt {`
- [src/components/PackRip.module.css:142](../../src/components/PackRip.module.css): `@keyframes edgeFlash {`
- [src/components/PackRip.module.css:149](../../src/components/PackRip.module.css): `.idleCard,.impactCard,.stripCards:has(.impactCard) { animation:none; transform:none; }`
- [src/components/PackRip.module.css:150](../../src/components/PackRip.module.css): `.impactCard::after { animation:none; opacity:1; border-color:var(--gold); border-image:none; }`
- [src/components/PhaseTransition.jsx:15](../../src/components/PhaseTransition.jsx): `<m.div key={phaseKey} variants={wipeIn} initial="initial" animate="animate" exit="exit">`
- [src/components/RouteError.module.css:61](../../src/components/RouteError.module.css): `transition: background var(--dur-micro), transform var(--dur-micro);`
- [src/components/RunHud.module.css:16](../../src/components/RunHud.module.css): `transition: background var(--dur-micro);`
- [src/components/SeriesCardTable.jsx:172](../../src/components/SeriesCardTable.jsx): `initial={{ opacity: 0, scale: 0.94 }}`
- [src/components/SeriesCardTable.jsx:173](../../src/components/SeriesCardTable.jsx): `animate={{ opacity: 1, scale: 1 }}`
- [src/components/SeriesCardTable.jsx:297](../../src/components/SeriesCardTable.jsx): `<m.div key={card.id} className={styles.dealtMap} initial={{ opacity: 0, y: -80, rotate: (index - maps.length / 2) * 4 }} animate={{ opacity: 1, y: 0, rotate: 0 }} transition={{ duration: DUR.enter, ease: EASE.out, delay: index * STAGGER }}>`
- [src/components/SeriesCardTable.jsx:399](../../src/components/SeriesCardTable.jsx): `<m.li key={step.key} data-step={step.key} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: DUR.hover, ease: EASE.out }}>`
- [src/components/SeriesCardTable.jsx:455](../../src/components/SeriesCardTable.jsx): `<m.div key={reveal.player.uid} className={styles.selectedTactic} layout initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }}>`
- [src/components/SeriesCardTable.jsx:459](../../src/components/SeriesCardTable.jsx): `<m.div key="player-hand" className={styles.tacticHand} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>`
- [src/components/SeriesCardTable.jsx:461](../../src/components/SeriesCardTable.jsx): `<m.div key={card.uid} className={styles.handCard} onPointerEnter={() => onHover?.(card)} onPointerLeave={() => onHover?.(null)} onFocus={() => onHover?.(card)} onBlur={() => onHover?.(null)} initial={{ opacity: 0, y: 50, rotate: (index - hand.length / 2) * 2 }} animate={{ opacity: 1, y: 0, rotate: 0 }} transition={{ duration: DUR.enter, ease: EASE.out, delay: index * STAGGER }}><TacticCard instance={card} onPlay={onPlay} compact={narrow} mult={multFor?.(card) ?? null} /></m.div>`
- [src/components/SeriesCardTable.jsx:468](../../src/components/SeriesCardTable.jsx): `<m.span className={styles.clashMark} data-edge={reveal?.edge} animate={{ opacity: reveal ? 1 : 0, scale: reveal ? 1 : .75 }}>×</m.span>`
- [src/components/SeriesCardTable.jsx:476](../../src/components/SeriesCardTable.jsx): `<m.div key={card.uid} layout initial={{ opacity: 0, y: -45, rotate: index ? 3 : -3 }} animate={{ opacity: 1, y: 0, rotate: 0 }} exit={{ opacity: 0, y: -35, scale: .85 }} transition={{ duration: DUR.enter, ease: EASE.out }}>`
- [src/components/SeriesCardTable.jsx:542](../../src/components/SeriesCardTable.jsx): `<div className={styles.patchCards}>{cards.map((card, index) => <m.div key={card.id} initial={{ opacity: 0, y: -30, rotate: index - 1 }} animate={{ opacity: 1, y: 0, rotate: 0 }} transition={{ duration: DUR.enter, ease: EASE.out, delay: index * STAGGER }}><MapCard card={card} compact /></m.div>)}</div>`
- [src/components/SeriesCardTable.module.css:44](../../src/components/SeriesCardTable.module.css): `transition: translate var(--dur-transform) var(--ease-out);`
- [src/components/SeriesCardTable.module.css:128](../../src/components/SeriesCardTable.module.css): `transition:transform var(--dur-hero) var(--ease-out);`
- [src/components/SeriesCardTable.module.css:169](../../src/components/SeriesCardTable.module.css): `.cardPlane, .cardGlare { transition: transform var(--dur-hover) var(--ease-out), opacity var(--dur-transform) var(--ease-out); }`
- [src/components/SeriesCardTable.module.css:455](../../src/components/SeriesCardTable.module.css): `.dealtMap { transition:none; }`
- [src/components/SeriesCardTable.module.css:518](../../src/components/SeriesCardTable.module.css): `transition: width var(--dur-enter) var(--ease-out);`
- [src/components/SeriesCardTable.module.css:546](../../src/components/SeriesCardTable.module.css): `.edgeTrack i { transition: none; }`
- [src/components/Sheet.module.css:49](../../src/components/Sheet.module.css): `transition: color var(--dur-micro), background var(--dur-micro);`
- [src/components/SigningSequence.module.css:72](../../src/components/SigningSequence.module.css): `transition: background var(--dur-hover);`
- [src/components/SigningSequence.module.css:85](../../src/components/SigningSequence.module.css): `transition: color var(--dur-hover);`
- [src/components/SigningSequence.module.css:90](../../src/components/SigningSequence.module.css): `.secondary, .cancel { transition: none; }`
- [src/components/SquadBar.module.css:73](../../src/components/SquadBar.module.css): `transition: outline-color var(--dur-hover);`
- [src/components/SquadBar.module.css:83](../../src/components/SquadBar.module.css): `.dockSlot { transition: none; }`
- [src/components/SquadDock.jsx:242](../../src/components/SquadDock.jsx): `animate(x, 0, { ...cardSpring, onComplete: () => setGhostRect(null) }),`
- [src/components/SquadDock.jsx:243](../../src/components/SquadDock.jsx): `animate(y, 0, cardSpring),`
- [src/components/SquadDock.jsx:244](../../src/components/SquadDock.jsx): `animate(rotate, 0, cardSpring),`
- [src/components/SquadDock.jsx:350](../../src/components/SquadDock.jsx): `exit={cardLeave.exit}`
- [src/components/SquadDock.jsx:375](../../src/components/SquadDock.jsx): `layoutId={focusCardId === card.id ? undefined : card-${card.id}}`
- [src/components/SquadDock.module.css:34](../../src/components/SquadDock.module.css): `transition: translate var(--dur-transform) var(--ease-out), opacity var(--dur-micro) linear;`
- [src/components/SquadDock.module.css:113](../../src/components/SquadDock.module.css): `animation:activeCardBeat 700ms var(--ease-out) both;`
- [src/components/SquadDock.module.css:142](../../src/components/SquadDock.module.css): `@keyframes activeCardBeat { from { opacity:0; transform:scale(.92); } 45% { opacity:1; } to { opacity:.55; transform:none; } }`
- [src/components/SquadDock.module.css:145](../../src/components/SquadDock.module.css): `animation:dropWarning var(--dur-hero) ease-in-out infinite alternate;`
- [src/components/SquadDock.module.css:150](../../src/components/SquadDock.module.css): `@keyframes dropWarning {`
- [src/components/SquadDock.module.css:191](../../src/components/SquadDock.module.css): `.chip[data-igl-stamp="true"] { animation:iglStamp var(--dur-hero) var(--ease-out); }`
- [src/components/SquadDock.module.css:194](../../src/components/SquadDock.module.css): `animation:iglShockwave var(--dur-hero) var(--ease-out) both;`
- [src/components/SquadDock.module.css:196](../../src/components/SquadDock.module.css): `@keyframes iglStamp {`
- [src/components/SquadDock.module.css:201](../../src/components/SquadDock.module.css): `@keyframes iglShockwave {`
- [src/components/SquadDock.module.css:218](../../src/components/SquadDock.module.css): `transition: translate var(--dur-transform) var(--ease-out);`
- [src/components/SquadDock.module.css:267](../../src/components/SquadDock.module.css): `animation: chipRise var(--dur-transform) var(--ease-out) both;`
- [src/components/SquadDock.module.css:311](../../src/components/SquadDock.module.css): `@keyframes chipRise {`
- [src/components/SquadDock.module.css:349](../../src/components/SquadDock.module.css): `transition: background var(--dur-hover), color var(--dur-hover);`
- [src/components/SquadDock.module.css:358](../../src/components/SquadDock.module.css): `.chip, .chip:hover + .chip, .chip:has(+ .chip:hover), .chipEmpty { transition: none; }`
- [src/components/SquadDock.module.css:359](../../src/components/SquadDock.module.css): `.chipPreview { animation: none; }`
- [src/components/SquadDock.module.css:361](../../src/components/SquadDock.module.css): `.chip[data-drop-active="true"] .chipOutline,.chip[data-igl-stamp="true"],.chip[data-igl-stamp="true"] .chipOutline { animation:none; }`
- [src/components/SquadDock.module.css:380](../../src/components/SquadDock.module.css): `transition: filter var(--dur-transform, 0.16s);`
- [src/components/SquadDock.module.css:389](../../src/components/SquadDock.module.css): `animation: slotDeal 0.72s var(--ease-out) both;`
- [src/components/SquadDock.module.css:399](../../src/components/SquadDock.module.css): `animation: slotDealEdge 0.72s var(--ease-out) both;`
- [src/components/SquadDock.module.css:402](../../src/components/SquadDock.module.css): `@keyframes slotDeal {`
- [src/components/SquadDock.module.css:420](../../src/components/SquadDock.module.css): `@keyframes slotDealEdge {`
- [src/components/SquadDock.module.css:427](../../src/components/SquadDock.module.css): `.chipEmpty[data-new='true'] { animation: none; }`
- [src/components/SquadDock.module.css:440](../../src/components/SquadDock.module.css): `animation: slotAlert 0.6s ease-in-out 3;`
- [src/components/SquadDock.module.css:449](../../src/components/SquadDock.module.css): `animation: dropWarning var(--dur-hero) ease-in-out 3 alternate;`
- [src/components/SquadDock.module.css:452](../../src/components/SquadDock.module.css): `@keyframes slotAlert {`
- [src/components/SquadDock.module.css:460](../../src/components/SquadDock.module.css): `animation: none;`
- [src/components/SquadSheet.jsx:185](../../src/components/SquadSheet.jsx): `animate={armed ? { boxShadow: ['0 0 0 0px transparent', '0 0 0 6px var(--accent-soft)', '0 0 0 0px transparent'] } : { boxShadow: '0 0 0 0px transparent' }}`
- [src/components/SquadSheet.module.css:14](../../src/components/SquadSheet.module.css): `animation: fadeIn var(--dur-transform) ease-out;`
- [src/components/SquadSheet.module.css:41](../../src/components/SquadSheet.module.css): `animation: previewRise var(--dur-transform) var(--ease-out) both;`
- [src/components/SquadSheet.module.css:44](../../src/components/SquadSheet.module.css): `@keyframes previewRise {`
- [src/components/SquadSheet.module.css:75](../../src/components/SquadSheet.module.css): `transition: background var(--dur-hover);`
- [src/components/SquadSheet.module.css:96](../../src/components/SquadSheet.module.css): `transition: background var(--dur-hover);`
- [src/components/SquadSheet.module.css:109](../../src/components/SquadSheet.module.css): `transition: opacity var(--dur-hover);`
- [src/components/SquadSheet.module.css:149](../../src/components/SquadSheet.module.css): `transition: transform var(--dur-transform);`
- [src/components/SquadSheet.module.css:150](../../src/components/SquadSheet.module.css): `animation: faceIn 0.5s cubic-bezier(0.2, 0.8, 0.2, 1) both;`
- [src/components/SquadSheet.module.css:151](../../src/components/SquadSheet.module.css): `animation-delay: calc(var(--i) * 70ms);`
- [src/components/SquadSheet.module.css:190](../../src/components/SquadSheet.module.css): `@keyframes faceIn {`
- [src/components/SquadSheet.module.css:238](../../src/components/SquadSheet.module.css): `transition: background var(--dur-micro), color var(--dur-micro);`
- [src/components/SquadSheet.module.css:251](../../src/components/SquadSheet.module.css): `@keyframes fadeIn {`
- [src/components/SquadSheet.module.css:257](../../src/components/SquadSheet.module.css): `.backdrop { animation: none; }`
- [src/components/SquadSheet.module.css:258](../../src/components/SquadSheet.module.css): `.face { animation: none; transition: none; }`
- [src/components/SquadSheet.module.css:259](../../src/components/SquadSheet.module.css): `.preview { animation: none; }`
- [src/components/TacticReturn.jsx:32](../../src/components/TacticReturn.jsx): `const enter = animate(el, {`
- [src/components/TacticReturn.jsx:59](../../src/components/TacticReturn.jsx): `exit = animate(el, {`
- [src/components/TacticalButton.jsx:18](../../src/components/TacticalButton.jsx): `whileTap={{ scale: 0.97, filter: 'brightness(0.85)' }}`
- [src/lib/bracketFlight.js:55](../../src/lib/bracketFlight.js): `const animation = animate(clone, {`
- [src/lib/flight.js:63](../../src/lib/flight.js): `const animation = animate(clone, {`
- [src/lib/flight.js:108](../../src/lib/flight.js): `const animation = animate(clone, {`
- [src/lib/useScrollLean.js:59](../../src/lib/useScrollLean.js): `frameRef.current = requestAnimationFrame(tick);`
- [src/lib/useScrollLean.js:61](../../src/lib/useScrollLean.js): `frameRef.current = requestAnimationFrame(tick);`
- [src/lib/useScrollLean.js:72](../../src/lib/useScrollLean.js): `animate();`
- [src/lib/useSkippableTimeline.js:67](../../src/lib/useSkippableTimeline.js): `let frame = requestAnimationFrame(function tick() {`
- [src/lib/useSkippableTimeline.js:70](../../src/lib/useSkippableTimeline.js): `if (left > 0) frame = requestAnimationFrame(tick);`
- [src/pages/Collection.module.css:27](../../src/pages/Collection.module.css): `transition: background-color var(--dur-micro), color var(--dur-micro);`
- [src/pages/Collection.module.css:60](../../src/pages/Collection.module.css): `transition: background 0.12s;`
- [src/pages/Collection.module.css:107](../../src/pages/Collection.module.css): `transition: background 0.12s, color 0.12s;`
- [src/pages/Collection.module.css:181](../../src/pages/Collection.module.css): `transition: background 0.12s ease;`
- [src/pages/Match.jsx:62](../../src/pages/Match.jsx): `simulationTimer.current = setInterval(() => {`
- [src/pages/Match.module.css:135](../../src/pages/Match.module.css): `transition: transform var(--dur-hover);`
- [src/pages/Match.module.css:220](../../src/pages/Match.module.css): `transition: background var(--dur-micro), color var(--dur-micro);`
- [src/pages/Multiplayer.jsx:518](../../src/pages/Multiplayer.jsx): `initial={{ opacity: 0, y: 8 }}`
- [src/pages/Multiplayer.jsx:519](../../src/pages/Multiplayer.jsx): `animate={{ opacity: 1, y: 0 }}`
- [src/pages/Multiplayer.jsx:719](../../src/pages/Multiplayer.jsx): `const id = setInterval(tick, 100);`
- [src/pages/Multiplayer.jsx:732](../../src/pages/Multiplayer.jsx): `const id = setInterval(tick, 250);`
- [src/pages/Multiplayer.module.css:67](../../src/pages/Multiplayer.module.css): `.timerDock button { position:relative; display:block; width:min(720px,100%); min-height:68px; margin:auto; overflow:hidden; border:2px solid var(--accent); background:#191d2a; color:white; font-size:17px; font-weight:700; letter-spacing:.12em; text-transform:uppercase; transition:transform var(--dur-hover),filter var(--dur-hover); }`
- [src/pages/Multiplayer.module.css:68](../../src/pages/Multiplayer.module.css): `.timerDock button::before { content:''; position:absolute; inset:0; background:var(--accent); transform:scaleX(var(--remaining)); transform-origin:left; transition:transform var(--dur-micro) linear; }.timerDock button span { position:relative; }.timerDock button:not(:disabled):hover { transform:translateY(-3px); filter:brightness(1.08); }.timerDock button:not(:disabled):active { transform:translateY(1px) scale(.99); }`
- [src/pages/Multiplayer.module.css:78](../../src/pages/Multiplayer.module.css): `@media(prefers-reduced-motion:reduce){.timerDock button,.timerDock button::before{transition:none}}`
- [src/pages/PackOpening.module.css:3](../../src/pages/PackOpening.module.css): `the page's own layout and the "open another" affordance below it. */`
- [src/pages/PackOpening.module.css:47](../../src/pages/PackOpening.module.css): `transition: background var(--dur-micro), color var(--dur-micro);`
- [src/pages/PerfectRun.jsx:1141](../../src/pages/PerfectRun.jsx): `revealTimer.current = setInterval(() => {`
- [src/pages/PerfectRun.jsx:2573](../../src/pages/PerfectRun.jsx): `initial={roundFlash ? {`
- [src/pages/PerfectRun.jsx:2578](../../src/pages/PerfectRun.jsx): `animate={{ color: 'var(--ink)', opacity: 1, y: 0 }}`
- [src/pages/PerfectRun.jsx:3228](../../src/pages/PerfectRun.jsx): `<m.p className={styles.groupNote} animate={eliminationFlash.animate}>`
- [src/pages/PerfectRun.jsx:3273](../../src/pages/PerfectRun.jsx): `<m.h2 className={styles.overFail} animate={eliminationFlash.animate}>`
- [src/pages/PerfectRun.jsx:3307](../../src/pages/PerfectRun.jsx): `initial={{ opacity: 0, y: 8 }}`
- [src/pages/PerfectRun.jsx:3308](../../src/pages/PerfectRun.jsx): `animate={{ opacity: 1, y: 0 }}`
- [src/pages/PerfectRun.module.css:112](../../src/pages/PerfectRun.module.css): `transition: transform 0.12s;`
- [src/pages/PerfectRun.module.css:126](../../src/pages/PerfectRun.module.css): `transition: background 0.12s;`
- [src/pages/PerfectRun.module.css:164](../../src/pages/PerfectRun.module.css): `transition: transform var(--dur-micro) linear;`
- [src/pages/PerfectRun.module.css:180](../../src/pages/PerfectRun.module.css): `transition: background var(--dur-hover), color var(--dur-hover);`
- [src/pages/PerfectRun.module.css:185](../../src/pages/PerfectRun.module.css): `.skipFill { transition: none; }`
- [src/pages/PerfectRun.module.css:228](../../src/pages/PerfectRun.module.css): `transition: color var(--dur-hover);`
- [src/pages/PerfectRun.module.css:253](../../src/pages/PerfectRun.module.css): `.rise { animation: riseIn var(--dur-hero) var(--ease-out) both; }`
- [src/pages/PerfectRun.module.css:254](../../src/pages/PerfectRun.module.css): `.riseB { animation-delay: 0.06s; }`
- [src/pages/PerfectRun.module.css:255](../../src/pages/PerfectRun.module.css): `.riseC { animation-delay: 0.12s; }`
- [src/pages/PerfectRun.module.css:257](../../src/pages/PerfectRun.module.css): `@keyframes riseIn {`
- [src/pages/PerfectRun.module.css:261](../../src/pages/PerfectRun.module.css): `@keyframes landingFanIn {`
- [src/pages/PerfectRun.module.css:265](../../src/pages/PerfectRun.module.css): `@keyframes landingFanInMobile {`
- [src/pages/PerfectRun.module.css:298](../../src/pages/PerfectRun.module.css): `animation: landingFanIn 0.7s 0.15s var(--ease-out) both;`
- [src/pages/PerfectRun.module.css:310](../../src/pages/PerfectRun.module.css): `.landingFan .fanCard { position: absolute; top: 50%; left: 50%; transition: none; }`
- [src/pages/PerfectRun.module.css:362](../../src/pages/PerfectRun.module.css): `transition: transform var(--dur-transform) var(--ease-out), box-shadow var(--dur-transform) var(--ease-out);`
- [src/pages/PerfectRun.module.css:370](../../src/pages/PerfectRun.module.css): `transition: transform 0.38s var(--ease-out);`
- [src/pages/PerfectRun.module.css:405](../../src/pages/PerfectRun.module.css): `transition: color var(--dur-hover), text-decoration-color var(--dur-hover);`
- [src/pages/PerfectRun.module.css:433](../../src/pages/PerfectRun.module.css): `transition: color var(--dur-hover), background var(--dur-hover), border-color var(--dur-hover);`
- [src/pages/PerfectRun.module.css:499](../../src/pages/PerfectRun.module.css): `transition: color var(--dur-hover), border-color var(--dur-hover);`
- [src/pages/PerfectRun.module.css:518](../../src/pages/PerfectRun.module.css): `.landingFan { animation-name: landingFanInMobile; }`
- [src/pages/PerfectRun.module.css:538](../../src/pages/PerfectRun.module.css): `transition: background 0.12s, color 0.12s;`
- [src/pages/PerfectRun.module.css:715](../../src/pages/PerfectRun.module.css): `.revealed { animation: resultIn 0.35s ease; }`
- [src/pages/PerfectRun.module.css:716](../../src/pages/PerfectRun.module.css): `@keyframes resultIn {`
- [src/pages/PerfectRun.module.css:821](../../src/pages/PerfectRun.module.css): `transition: transform var(--dur-hover);`
- [src/pages/PerfectRun.module.css:835](../../src/pages/PerfectRun.module.css): `animation: scoutDeal var(--dur-enter) var(--ease-out) both;`
- [src/pages/PerfectRun.module.css:846](../../src/pages/PerfectRun.module.css): `@keyframes scoutDeal { from { opacity:0; transform:translateY(8px) rotate(-1deg); } to { opacity:1; transform:none; } }`
- [src/pages/PerfectRun.module.css:1094](../../src/pages/PerfectRun.module.css): `transition: border-color 0.14s, background 0.14s;`
- [src/pages/PerfectRun.module.css:1144](../../src/pages/PerfectRun.module.css): `transition: border-color 0.15s, transform 0.15s, background 0.15s;`
- [src/pages/PerfectRun.module.css:1186](../../src/pages/PerfectRun.module.css): `animation: riseIn 0.5s cubic-bezier(0.2, 0.8, 0.2, 1) both;`
- [src/pages/PerfectRun.module.css:1360](../../src/pages/PerfectRun.module.css): `transition: transform var(--dur-transform);`
- [src/pages/PerfectRun.module.css:1361](../../src/pages/PerfectRun.module.css): `animation: heroIn 0.55s cubic-bezier(0.2, 0.8, 0.2, 1) both;`
- [src/pages/PerfectRun.module.css:1362](../../src/pages/PerfectRun.module.css): `animation-delay: calc(var(--i) * 90ms);`
- [src/pages/PerfectRun.module.css:1372](../../src/pages/PerfectRun.module.css): `@keyframes heroIn {`
- [src/pages/PerfectRun.module.css:1421](../../src/pages/PerfectRun.module.css): `animation: heroIn 0.5s cubic-bezier(0.2, 0.8, 0.2, 1) both;`
- [src/pages/PerfectRun.module.css:1422](../../src/pages/PerfectRun.module.css): `animation-delay: calc(var(--i) * 80ms);`
- [src/pages/PerfectRun.module.css:1424](../../src/pages/PerfectRun.module.css): `.castBandRight .castFace { animation-delay: calc((4 - var(--i)) * 80ms); }`
- [src/pages/PerfectRun.module.css:1541](../../src/pages/PerfectRun.module.css): `animation: specialtyCardPulse var(--dur-transform) var(--ease-out);`
- [src/pages/PerfectRun.module.css:1558](../../src/pages/PerfectRun.module.css): `animation: specialtyChip var(--dur-transform) var(--ease-out) both;`
- [src/pages/PerfectRun.module.css:1563](../../src/pages/PerfectRun.module.css): `animation: specialtyThreshold 80ms steps(2, end);`
- [src/pages/PerfectRun.module.css:1565](../../src/pages/PerfectRun.module.css): `@keyframes specialtyCardPulse {`
- [src/pages/PerfectRun.module.css:1569](../../src/pages/PerfectRun.module.css): `@keyframes specialtyChip {`
- [src/pages/PerfectRun.module.css:1574](../../src/pages/PerfectRun.module.css): `@keyframes specialtyThreshold {`
- [src/pages/PerfectRun.module.css:1648](../../src/pages/PerfectRun.module.css): `.castPlayer[data-triggered="true"], .castTrigger, .castScore[data-specialty-active="true"] { animation:none; }`
- [src/pages/PerfectRun.module.css:1777](../../src/pages/PerfectRun.module.css): `transition: background 0.12s, color 0.12s;`
- [src/pages/PerfectRun.module.css:1845](../../src/pages/PerfectRun.module.css): `.introTitle { animation: none; }`
- [src/pages/PerfectRun.module.css:1846](../../src/pages/PerfectRun.module.css): `.revealed { animation: none; }`
- [src/pages/PerfectRun.module.css:1847](../../src/pages/PerfectRun.module.css): `.rise { animation: none; }`
- [src/pages/PerfectRun.module.css:1848](../../src/pages/PerfectRun.module.css): `.landingFan { animation: none; opacity: .16; }`
- [src/pages/PerfectRun.module.css:1849](../../src/pages/PerfectRun.module.css): `.landingPlay, .landingPlay::before { transition: none; }`
- [src/pages/PerfectRun.module.css:1850](../../src/pages/PerfectRun.module.css): `.fanCard { transition: none; }`
- [src/pages/PerfectRun.module.css:1851](../../src/pages/PerfectRun.module.css): `.heroFace { animation: none; transition: none; }`
- [src/pages/PerfectRun.module.css:2661](../../src/pages/PerfectRun.module.css): `transition: background 0.12s, color 0.12s;`
- [src/pages/PerfectRun.module.css:2761](../../src/pages/PerfectRun.module.css): `animation: slotArrive 0.5s cubic-bezier(0.2, 0.8, 0.2, 1) both;`
- [src/pages/PerfectRun.module.css:2764](../../src/pages/PerfectRun.module.css): `@keyframes slotArrive {`
- [src/pages/PerfectRun.module.css:2838](../../src/pages/PerfectRun.module.css): `.squadDeskOpen[data-new='true'] { animation: none; }`
- [src/pages/PreMatch.module.css:51](../../src/pages/PreMatch.module.css): `transition:`
