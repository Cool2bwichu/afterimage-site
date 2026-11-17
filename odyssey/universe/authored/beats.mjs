// The beat lexicon: things that happen in a story, found in the wording of a
// plot summary. Each beat has a plain phrase the site can say out loud
// ("a betrayal", "a death") and patterns that catch its common verbs.
//
// This is an instrument, not a reading: it counts words. It says a plot
// summary mentions a killing in its last third; it does not know who or why.
// `ending: true` marks beats that would give an ending away, so the site only
// names them in a film's final act once that film is marked as seen.

export const BEATS = [
  { id: 'arrival', phrase: 'an arrival', verb: 'someone arrives', re: /\b(arrives?|arriving|moves? (in|into|to)|comes? to (the |a )?(town|city|village|house|island)|newcomer|stranger (appears|comes))\b/ },
  { id: 'homecoming', phrase: 'a homecoming', verb: 'someone comes home', re: /\b(returns? (home|to (his|her|their) (home|hometown|village|family|native))|comes? (back )?home|homecoming)\b/ },
  { id: 'departure', phrase: 'a departure', verb: 'someone leaves', re: /\b(leaves? (for|the|town|home|him|her)|departs?|sets? (out|off)|says? goodbye|bids? farewell|emigrat\w+)\b/ },
  { id: 'journey', phrase: 'a journey', verb: 'they travel', re: /\b(journey|travels?|travell?ing|voyage|road trip|trek|expedition|pilgrimage|hitchhik\w+|drives? (across|through|to))\b/ },
  { id: 'meeting', phrase: 'a chance meeting', verb: 'two people meet', re: /\b(meets?|encounters?|befriends?|is introduced to|strikes? up|makes? friends)\b/ },
  { id: 'love', phrase: 'a love affair', verb: 'people fall in love', re: /\b(falls? in love|fall(s|ing)? for|in love with|romance|romantic|kiss(es|ed)?|lovers?|love affair|affair with|sleeps? (with|together)|make love|seduc\w+)\b/ },
  { id: 'marriage', phrase: 'a marriage', verb: 'a wedding', re: /\b(marr(y|ies|ied|iage)|wedding|engage(d|ment)|proposes?|honeymoon|bride|groom)\b/ },
  { id: 'parting', phrase: 'a separation', verb: 'a couple parts', re: /\b(break(s|ing)? up|broke up|divorces?|separat(es|ed|ion)|abandons?|leaves? (him|her) for|walks? out on|estranged)\b/ },
  { id: 'birth', phrase: 'a pregnancy', verb: 'a child is expected', re: /\b(pregnan(t|cy)|gives? birth|newborn|expecting a (child|baby)|abortion)\b/ },
  { id: 'killing', phrase: 'a killing', verb: 'someone is killed', ending: true, re: /\b(kills?|killed|killing|murders?|murdered|shoots? (him|her|them|and kills)|shot dead|stabs?|stabbed|strangl\w+|executes?|executed|assassinat\w+|slaughter\w*|massacre\w*)\b/ },
  { id: 'death', phrase: 'a death', verb: 'someone dies', ending: true, re: /\b(dies|died|dying|death|dead|drowns?|drowned|passes away|funeral|corpse|body is found|burial|buried)\b/ },
  { id: 'suicide', phrase: 'a suicide', verb: 'someone takes their own life', ending: true, re: /\b(suicide|kills? (himself|herself|themselves)|hangs? (himself|herself)|shoots? (himself|herself)|takes? (his|her) own life)\b/ },
  { id: 'violence', phrase: 'open violence', verb: 'it comes to blows', re: /\b(fights?|fighting|beats? (him|her|up)|beaten|attacks?|attacked|assaults?|brawl|duel|shootout|gunfight|ambush\w*|riot|rapes?|raped|tortur\w+)\b/ },
  { id: 'pursuit', phrase: 'a pursuit', verb: 'a chase', re: /\b(chases?|chased|pursu(es|ed|it)|hunts?|hunted|on the run|tracks? (him|her|them)? ?down|manhunt|fugitives?|follows? (him|her|them))\b/ },
  { id: 'capture', phrase: 'a capture', verb: 'someone is taken', ending: true, re: /\b(arrests?|arrested|captur(es|ed)|imprison(s|ed|ment)?|jailed|kidnaps?|kidnapped|abducts?|abducted|taken hostage|held captive|taken prisoner|locked (up|in))\b/ },
  { id: 'escape', phrase: 'an escape', verb: 'someone gets away', ending: true, re: /\b(escapes?|escaped|breaks? out|flees?|fled|gets? away|slips? away)\b/ },
  { id: 'rescue', phrase: 'a rescue', verb: 'someone is saved', ending: true, re: /\b(rescues?|rescued|saves? (him|her|them|the)|saved|comes? to (his|her|their) aid)\b/ },
  { id: 'deception', phrase: 'a deception', verb: 'someone lies about who they are', re: /\b(lies to|lied|deceiv(es|ed)|decepti\w+|pretends?|pretending|disguis(es|ed)|poses? as|posing as|tricks?|tricked|con(s|ned)? |impersonat\w+|false (identity|name)|secretly|in secret|fakes?|faked|forge[sd]?)\b/ },
  { id: 'betrayal', phrase: 'a betrayal', verb: 'someone is betrayed', re: /\b(betray(s|ed|al)?|double-cross\w*|turns? (him|her|them) in|informs? on|sells? (him|her|them) out|denounc\w+|treacher\w+)\b/ },
  { id: 'revelation', phrase: 'a revelation', verb: 'the truth comes out', re: /\b(discovers?|discovered|finds? out|learns? that|realizes?|realises?|reveal(s|ed)?|it is revealed|turns out|uncovers?|recogni[sz]es?|the truth)\b/ },
  { id: 'investigation', phrase: 'an investigation', verb: 'someone investigates', re: /\b(investigat\w+|detectives?|inquiry|interrogat\w+|clues?|evidence|suspects?|inspector|police search)\b/ },
  { id: 'judgment', phrase: 'a trial', verb: 'someone is judged', re: /\b(trial|courtroom|court|judge|jury|verdict|sentenced|testif\w+|tribunal|acquitted|convicted)\b/ },
  { id: 'crime', phrase: 'a crime planned', verb: 'a job is planned', re: /\b(robs?|robbed|robbery|heist|steals?|stole|stolen|theft|burglar\w*|smuggl\w+|blackmail\w*|ransom|loot|embezzl\w+|swindle\w*)\b/ },
  { id: 'revenge', phrase: 'revenge', verb: 'someone takes revenge', re: /\b(revenge|avenges?|avenged|vengeance|retaliat\w+|vendetta|payback|gets? even)\b/ },
  { id: 'war', phrase: 'a war', verb: 'war arrives', re: /\b(war|soldiers?|army|troops|battlefield|invasion|bombing|bombed|regiment|platoon|the front|occupation|resistance)\b/ },
  { id: 'illness', phrase: 'an illness', verb: 'someone falls ill', re: /\b(illness|falls? ill|sick|disease|cancer|tuberculosis|terminal|diagnos\w+|hospitali[sz]ed|stroke|heart attack|coma)\b/ },
  { id: 'madness', phrase: 'a breakdown', verb: 'a mind gives way', re: /\b(insane|insanity|madness|goes mad|breakdown|asylum|delusion\w*|paranoi\w+|psychosis|mental (hospital|institution|illness)|loses? (his|her) mind)\b/ },
  { id: 'dream', phrase: 'dreams and visions', verb: 'someone dreams', re: /\b(dreams?|dreamt|nightmares?|visions?|fantasi[sz]es?|hallucinat\w+|imagines?|trance)\b/ },
  { id: 'uncanny', phrase: 'something unnatural', verb: 'something unnatural appears', re: /\b(ghosts?|spirits?|haunt(s|ed|ing)?|demons?|possess(ed|ion)|curse[sd]?|witch\w*|vampires?|monsters?|creatures?|aliens?|supernatural|undead|zombies?)\b/ },
  { id: 'money', phrase: 'money trouble', verb: 'money runs out', re: /\b(debts?|bankrupt\w*|poverty|penniless|loses? (his|her) job|fired|unemploy\w+|evict\w+|loan|gambl\w+|fortune|inherit\w+)\b/ },
  { id: 'work', phrase: 'a job', verb: 'someone takes a job', re: /\b(hired|hires?|takes? a job|works? (as|at|for)|employer|boss|factory|apprentice|promotion|assignment)\b/ },
  { id: 'performance', phrase: 'a performance', verb: 'someone performs', re: /\b(performs?|performance|concert|on stage|rehears\w+|audition\w*|shoots? a film|filming|premiere|recital|sings?|dances?)\b/ },
  { id: 'reunion', phrase: 'a reunion', verb: 'people are reconciled', ending: true, re: /\b(reunit(es|ed)|reunion|reconcil(es|ed|iation)|forgives?|forgiven|embraces?|makes? peace|comes? back together)\b/ },
  { id: 'sacrifice', phrase: 'a sacrifice', verb: 'someone gives something up', ending: true, re: /\b(sacrific(es|ed)?|gives? (his|her) life|takes? the blame|gives? up (his|her)|lets? (him|her) go)\b/ },
  { id: 'confession', phrase: 'a confession', verb: 'someone confesses', re: /\b(confess(es|ed|ion)?|admits?|admitted|tells? the truth|comes? clean)\b/ },
  { id: 'celebration', phrase: 'a celebration', verb: 'a party', re: /\b(party|celebrat\w+|festival|feast|banquet|carnival|ball|dinner party)\b/ },
  { id: 'contest', phrase: 'a contest', verb: 'a contest', re: /\b(competition|contest|tournament|championship|the match|race|wager|bet|duel|challenge[sd]?)\b/ },
  { id: 'grief', phrase: 'a mourning', verb: 'someone grieves', re: /\b(grief|griev\w+|mourn\w+|widow\w*|orphan\w*|bereave\w+|loss of)\b/ },
  { id: 'solitude', phrase: 'someone left alone', verb: 'someone is left alone', ending: true, re: /\b(alone|lonely|loneliness|isolated|by (himself|herself)|walks? away|drives? away|wanders?)\b/ },
  { id: 'threat', phrase: 'a threat', verb: 'a threat closes in', re: /\b(threat(s|ens|ened)?|menac\w+|stalk(s|ed|ing)?|warns?|warned|blackmail\w*|danger\w*|terrori[sz]\w+)\b/ },
  { id: 'secret', phrase: 'a secret', verb: 'a secret is kept', re: /\b(secrets?|hides?|hidden|hiding|conceal\w*|cover(s|ed)? up|mystery|mysterious)\b/ },
  { id: 'transformation', phrase: 'a transformation', verb: 'someone is changed', re: /\b(transforms?|transformed|transformation|turns? into|becomes? a|metamorphos\w+|mutat\w+)\b/ },
  { id: 'power', phrase: 'a rise to power', verb: 'someone gains power', re: /\b(rises? to (power|the top|prominence)|takes? (control|power)|seizes? (control|power|the throne)|becomes? (the )?(leader|king|queen|boss|head|ruler|don)|elected|crowned|usurps?|throne)\b/ },
  { id: 'fall', phrase: 'a downfall', verb: 'someone is brought down', ending: true, re: /\b(downfall|ruin(s|ed)?|loses? everything|disgrace[sd]?|humiliat\w+|exiled?|banish\w+|overthrow\w*|collaps\w+|destroyed)\b/ },
  { id: 'faith', phrase: 'a test of faith', verb: 'faith is tested', re: /\b(priest|prays?|prayer|god|church|faith|miracle|monk|nun|sermon|sin|salvation|pilgrim\w*)\b/ },
  { id: 'childhood', phrase: 'a childhood', verb: 'a child watches', re: /\b(child|children|boy|girl|schoolboy|schoolgirl|teenager|adolescen\w+|classmates?|orphanage)\b/ },
];

/** Six story shapes, after Vonnegut and the emotional-arc studies that followed him. */
export const ARCS = [
  { id: 'rise', name: 'A rise', line: 'things get steadily better', shape: t => -Math.cos(Math.PI * t) },
  { id: 'fall', name: 'A fall', line: 'things get steadily worse', shape: t => Math.cos(Math.PI * t) },
  { id: 'hole', name: 'Down, then out', line: 'a fall into trouble and a climb back out', shape: t => Math.cos(2 * Math.PI * t) },
  { id: 'icarus', name: 'Up, then down', line: 'a rise that ends in a fall', shape: t => -Math.cos(2 * Math.PI * t) },
  { id: 'cinderella', name: 'Up, down, up', line: 'a rise, a reversal, and a late recovery', shape: t => -Math.cos(3 * Math.PI * t) },
  { id: 'oedipus', name: 'Down, up, down', line: 'a fall, a reprieve, and a final fall', shape: t => Math.cos(3 * Math.PI * t) },
];
