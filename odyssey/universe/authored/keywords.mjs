// Sorting the catalogue's free-form keywords into the light each belongs to.
// A keyword such as "rain" is something you see (Image); "revenge" is something
// that happens (Story); "1940s" is where a film lives (World); "melancholy" is
// how it feels (Feeling); "grief" is what it is about (Idea). Keywords about
// the production ("sequel", "based on novel") say nothing about likeness and
// are dropped.

const list = text => new Set(text.split('|').map(item => item.trim()).filter(Boolean));

const DROP = list(`based on novel or book|woman director|based on true story|sequel|remake|based on play or musical|
based on short story|based on manga|semi autobiographical|based on memoir or autobiography|based on comic|
aftercreditsstinger|duringcreditsstinger|independent film|based on young adult novel|partially lost film|
based on tv series|prequel|tuwaderalit|east asian lead|psychotronic|based on real person|
based on myths, legends or folklore|based on children's book|based on fairy tale|making of|female protagonist|
biography|autobiographical|short film|anthology|based on graphic novel|based on video game|reboot|spin off|
cult film|live action remake|based on poem|based on opera|criterion|art house|adult animation|3d animation|
hand drawn animation|live action and animation|individual|relationship|friends|praise|familiar|conflict|plan|
historical figure|film history|lost film|pre-code|b movie|preserved film|based on song, poem or rhyme`);

const MOOD = list(`suspenseful|complex|intense|dramatic|excited|absurd|bold|admiring|amused|ambiguous|audacious|tragic|
aggressive|awestruck|inspirational|shocking|hilarious|romantic|thoughtful|depressing|anxious|complicated|hopeful|
reflective|antagonistic|disturbed|introspective|provocative|adoring|cautionary|compassionate|defiant|dreary|mysterious|
melodramatic|critical|somber|sinister|grim|ominous|playful|informative|wistful|distressing|intimate|nostalgic|vibrant|
frantic|comforting|frightened|empathetic|biting|cynical|harsh|angry|baffled|witty|whimsical|paranoid|callous|cheerful|
appreciative|horrified|joyful|commanding|exhilarated|blunt|euphoric|bitter|frustrated|depressed|satirical|disheartening|
understated|candid|meditative|macabre|curious|loving|ambivalent|mischievous|cruel|assertive|incredulous|foreboding|
desperate|lyrical|ridiculous|powerful|gentle|celebratory|demeaning|farcical|bewildered|tense|joyous|exuberant|
lighthearted|grand|enthusiastic|irreverent|disgusted|hostile|doubtful|sadistic|calm|sentimental|questioning|earnest|
bleak|arrogant|sincere|embarrassed|melancholy|surreal|philosophical|grimdark|enchant|tragedy|sadness|rage|despair|
panic|fear|unhappiness|lust|shame|humiliation|rage and hate|hopeless|serene|vindictive|sympathetic|pessimistic|
optimistic|awkward|uplifting|eerie|creepy|dark|zealous|tragicomedy|gloomy|contemptuous|egotistical|straightforward|
matter of fact|conceited|skeptical|apathetic|relaxed|pretentious|didactic|direct|detached|scathing|sardonic|urgent`);

const FORM = list(`black and white|silent film|anime|stop motion|surrealism|german expressionism|expressionism|
slow cinema|contemplative cinema|observational documentary|observational cinema|direct cinema|experimental cinema|
avant-garde|avant garde|vistavision|techniscope|technicolor|cinemascope|archive footage|found footage|long take|
one take|handheld camera|voice over|voiceover|narration|breaking the fourth wall|split screen|freeze frame|
dream sequence|montage|mockumentary|essay film|cinéma vérité|cinema verite|docudrama|rotoscoping|claymation|
puppetry|time lapse|slow motion|70mm|super 8|video essay|experimental|symbolism|allegory|allegorical|minimalism|
colour film|tinted|two strip technicolor|magic lantern|musical|opera|ballet|dance|jazz|concert|singing|piano|song`);

const ICON = list(`rain|snow|fog|storm|winter|summer|train|boat|ship|airplane|cat|dog|horse|mask|mirror|gun|sword|
motorcycle|car|truck|bus|taxi|bridge|river|sea|beach|fire|rifle|helicopter|van|apple|donkey|goat|rat|coffin|
letter|diary|painting|portrait|photograph|photography|videotape|telephone|clock tower|wheelchair|cigar smoking|
smoking|food|sake|alcohol|gold|oil|petrol|bible|chess|swing|subway|railroad|cattle|bicycle|doll|umbrella|window|
staircase|elevator|typewriter|camera|radio|television|newspaper|flower|moon|sun|shadow|night|darkness|ruins|
neon|rainstorm|snowstorm|mountain|forest|jungle|desert|island|volcano|earthquake|flood|ocean|lake|waterfall`);

const EVENT = list(`murder|revenge|suicide|adultery|investigation|infidelity|extramarital affair|rape|love triangle|
kidnapping|road trip|robbery|suicide attempt|on the run|blackmail|betrayal|torture|conspiracy|wedding|divorce|
forbidden love|secret love|assassination|missing person|chase|hostage|heist|time travel|amnesia|escape|rescue|
seduction|stalking|possession|disappearance|undercover|bank robbery|treasure hunt|quest|prison escape|duel|
car crash|car accident|journey|cover-up|fake identity|dual identity|secret identity|double life|double cross|
murder plot|rescue mission|mission|deception|siege|murder investigation|falling in love|unrequited love|
marriage proposal|arranged marriage|new love|love affair|hallucination|nightmare|confession|trial|interrogation|
showdown|shootout|gun battle|gunfight|sword fight|fight|fistfight|battle|revolution|rebellion|massacre|genocide|
falsely accused|race against time|break-up|ransom|home invasion|shipwreck|evacuation|expedition|killing spree|
execution|self sacrifice|sacrifice|survival|transformation|experiment|prophecy|saving the world|alien invasion|
alien contact|hold-up robbery|runaway couple|fugitive lovers|attempted murder|series of murders|mass murder|
child murder|crime of passion|descent into madness|mental breakdown|attempt to escape|terrorist plot|
political assassination|police chase|car journey|farewell|kiss|pregnancy|abortion|funeral|honeymoon|
birthday party|inheritance|adoption|ambush|explosion|bombing|car bomb|strangulation|poison|suspicion of murder|
suspicion|whodunit|murder mystery|struggle for survival|human vs nature|man vs machine|moral dilemma|
identity crisis|midlife crisis|marriage crisis|failing marriage|crisis of faith|sexual awakening|becoming an adult|
coming of age|redemption|forgiveness|vengeance|rape and revenge|gang war|war crimes|desertion|emigration|exile|
treason|insurance fraud|forgery|counterfeit|theft|cheating|lie|secret|manipulation|trapped|chaos|destruction|
disaster|competition|rivalry|riddle|premonition|mutation|memory loss|loss of sense of reality|haunted by the past|
death of husband|loss of child|loss of loved one|dying and death|death|terminal illness|coma|heart attack|
car mechanic|flashback|told in flashback|nonlinear timeline|multiple storylines|film within a film|twist ending`);

const ROLE = list(`police|prostitute|gangster|lawyer|widow|detective|soldier|samurai|hitman|serial killer|doctor|
priest|criminal|psychopath|photographer|journalist|teacher|writer|spy|femme fatale|artist|assassin|sheriff|singer|
nun|orphan|yakuza|thief|scientist|private detective|drug dealer|reporter|psychiatrist|mistress|professor|nurse|
farmer|secret agent|jazz singer or musician|waitress|hero|princess|author|killer|bandit|rebel|bounty hunter|
con man|maid|pilot|superhero|pirate|drifter|gunslinger|pimp|housewife|screenwriter|policeman|hitchhiker|ex-con|
stranger|homeless person|musician|outlaw|geisha|womanizer|wizard|astronaut|stalker|painter|emperor|chosen one|
taxi driver|vigilante|pastor|architect|judge|businessman|millionaire|archaeologist|queen|courtesan|ronin|inventor|
boxer|gambler|general|servant|pianist|actress|movie star|king|mayor|sailor|clerk|politician|fugitive|villain|
anti hero|action hero|adventurer|mad scientist|film director|composer|playwright|hairdresser|surgeon|psychologist|
tourist|refugee|immigrant|peasant|factory worker|co-workers relationship|single mother|single father|teenage girl|
teenage boy|juvenile delinquent|delinquent|hoodlum|mobster|gunfighter|warrior|tragic hero|villainess|child hero|
crime fighter|undercover agent|police officer|police chief|fbi|central intelligence agency (cia)|usa president|
senator|saint|landlord|nanny|housekeeper|music teacher|fashion photographer|pop star|celebrity|ladykiller|seducer|
brothel madam|insurance agent|vietnam veteran|war veteran|japanese soldier|prisoner of war|cowboy|native american|
twins|doppelgänger|best friend|childhood friends|neighbor|lover|lovers|mother|father|daughter|brother|sister|
wife|uncle|fiancé|girlfriend|ex-wife|partner|buddy|baby|kids|teenager|virgin|mute|drunk|alcoholic`);

const THEME = list(`love|jealousy|poverty|obsession|corruption|greed|loneliness|religion|politics|voyeurism|memory|
class differences|depression|mental illness|alcoholism|drug addiction|racism|isolation|grief|identity|fascism|
communism|capitalism|faith|guilt|philosophy|childhood|madness|regret|bullying|sexuality|existentialism|morality|
alienation|aging|colonialism|addiction|nihilism|feminism|tradition|ambition|bureaucracy|oppression|technology|fate|
destiny|spirituality|homophobia|loyalty|decadence|art|freedom|humanity|masculinity|power|paranoia|eroticism|
money|friendship|marriage|family|dreams|drugs|prostitution|terrorism|organized crime|police brutality|
police corruption|political corruption|child abuse|sexual abuse|domestic violence|violence|brutality|cruelty|sadism|
sadomasochism|incest|lgbt|gay theme|male homosexuality|lesbian relationship|lesbian|interracial relationship|
age difference|older woman younger man relationship|older man younger woman relationship|unsociability|insanity|
schizophrenia|psychosis|delusion|post-traumatic stress disorder (ptsd)|childhood trauma|difficult childhood|
guilty conscience|sexual obsession|sexual frustration|lovesickness|love of one's life|soulmates|tragic love|
love at first sight|man woman relationship|woman between two men|working class|upper class|middle class|
bourgeoisie|class|class struggle|class society|high society|wealth|wealthy family|unemployment|unemployed|debt|
homelessness|hunger|famine|slavery|exploitation|genocide|antisemitism|race relations|culture clash|
cultural conflict|religious fundamentalism|catholicism|christianity|buddhism|catholic|sin|afterlife|
life and death|mortality|time|nature|society|modern society|american dream|fame|success|career|work|
movie business|filmmaking|hollywood|theater play|theatre group|theater troupe|writing|poetry|fashion|modeling|
journalism|surveillance|artificial intelligence (a.i.)|transhumanism|nuclear weapons|atomic bomb|anti war|
patriotism|military|government|authoritarian|revolution|labor union|students' movement|student protest|protest|
counter-culture|free love|feminism|empowerment|idealism|community|human nature|evil|good versus evil|
character study|slice of life|gambling|boxing|sports|baseball|martial arts|aviation|fishing|archeology|
pornography|fetish|masturbation|cannibalism|ritual|occult|witchcraft|telepathy|telekinesis|hypnosis|
paranormal phenomena|supernatural|magic|curse|symbolism|drug abuse|drug use|drug trafficking|heroin|marijuana|
pot smoking|drunkenness|animal cruelty|gossip|bravery|cowardliness|intelligence|hostility|punishment|
pregnancy|blindness|cancer|illness|suicide`);

const RELATION = list(`husband wife relationship|family relationships|parent child relationship|sibling relationship|
mother son relationship|father daughter relationship|mother daughter relationship|father son relationship|
father son conflict|brother brother relationship|brother sister relationship|sister sister relationship|
grandmother grandson relationship|dysfunctional family|married couple|male friendship|female friendship|
japanese family|family history|family drama|violent husband|deceived husband|adulterous wife|pregnant woman|
traumatized woman|woman falls in love|rebellious youth|puberty|children in wartime`);

const TRADITION = list(`neo-noir|film noir|dystopia|jidaigeki|period drama|spaghetti western|psychological thriller|
psychological drama|psychological horror|dark comedy|satire|road movie|cyberpunk|body horror|space opera|
gothic horror|gothic|steampunk|supernatural horror|post-apocalyptic future|historical fiction|historical drama|
french noir|tech noir|japanese noir|survival horror|animal horror|folk horror|erotic thriller|erotic movie|
neo-western|western|wild west|peplum|swashbuckler|slasher|proto-slasher|giallo|screwball comedy|slapstick comedy|
romcom|legal drama|legal thriller|courtroom drama|conspiracy thriller|political thriller|magic realism|fairy tale|
lovecraftian|kung fu|anarchic comedy|black humor|melodrama|social & cultural documentary|fantasy|adventure|
romance|war|swordplay|samurai film|gangster film|heist film|spy film|monster movie|kaiju|zombie film|
vampire film|ghost story|haunted house|time-travel|space travel|space battle|space marine|space colony|
science fiction|psychological|exploitation film|blaxploitation|nunsploitation|pinku|roman porno|wuxia`);

const BEING = list(`ghost|witch|vampire|creature|demon|monster|zombie|devil|angel|spirit|mutant|cyborg|android|robot|
alien|alien life-form|extraterrestrial technology|flying saucer|dracula|cannibal|satan|super power|
parallel world|alien planet|spacecraft|planet|galaxy|planet mars|demonic possession|psychic|dragon|werewolf|
giant monster|dinosaur|artificial intelligence|clone|time machine|magic realism`);

const MOVEMENT = list(`japanese new wave|new german cinema|czech new wave|italian neo realism|neo realism|
french new wave|nouvelle vague|new hollywood|hong kong new wave|taiwanese new wave|british new wave|
cinema novo|dogme 95|poetic realism|soviet montage|kammerspielfilm|free cinema|l.a. rebellion|mumblecore`);

const PLACETYPE = list(`small town|rural area|hotel|prison|church|hospital|castle|brothel|countryside|school|village|
motel|nightclub|casino|circus|factory|restaurant|mansion|library|amusement park|bank|cafe|farm|office|diner|
airport|gas station|house|inn|apartment|country house|saloon|slum|boarding school|courtroom|court|cemetery|
hotel room|high school|wilderness|space|future|futuristic|distant future|seaside town|rural setting|urban setting|
insane asylum|psychiatric hospital|concentration camp|ghetto|convent (nunnery)|jail|border|black market|
night life|chinatown|criminal underworld|battlefield|slaughterhouse|submarine|cruise|exotic island|theater|
university|monastery|orphanage|suburb|suburbia|shopping mall|laboratory|space station|spaceship|mine|harbor|
port|lighthouse|cabin|swamp|canyon|ranch|plantation|palace|temple|shrine|bar|pub|studio|stage`);

const PERIOD = /^(\d{1,2}(st|nd|rd|th) century|\d{4}s|.* (period|era)( \(.*\))?|middle ages.*|medieval|ancient (rome|greece|egypt|china)|world war i{1,2}|vietnam war|pacific war|korean war|cold war|civil war|american civil war|spanish civil war|post war( japan)?|post world war ii|post-war|nazi occupation|nazi|cultural revolution|french revolution|russian revolution|mexican revolution|great depression|the holocaust|holocaust|feudal japan|bakumatsu|shogunate|british empire|ancient world|biblical epic|christmas|halloween|new year's eve|fourth of july|prohibition era|weimar republic|third reich|fascist italy|franco regime|apartheid|colonial .*|occupation|resistance|antiquity|renaissance|victorian england|wild west)$/;

const PLACES = list(`new york city|japan|los angeles, california|italy|texas|france|china|california|germany|africa|
england|australia|calcutta|hong kong|taiwan|las vegas|florida|arizona|south korea|india|mexico|scotland|iran|
poland|taipei|soviet union|philippines|europe|cuba|senegal|alaska|oklahoma|new mexico|new england|spain|missouri|
switzerland|great britain|vietnam|sweden|peru|mediterranean|indonesia|rio de janeiro|middle east|west germany|
south america|southern france|southern usa|central and south america|amazon rainforest|usa–mexico border|
washington state|ireland|russia|brazil|argentina|greece|egypt|israel|turkey|canada|new zealand|thailand|korea|
norway|denmark|finland|austria|hungary|czechoslovakia|yugoslavia|romania|portugal|belgium|netherlands|chile|
colombia|algeria|morocco|congo|south africa|nigeria|manhattan, new york city|brooklyn, new york city|
harlem, new york city|the bronx, new york city|queens, new york city|hollywood|sicily|tuscany|normandy|
provence|bavaria|siberia|hokkaido|okinawa|kansas|montana|wyoming|nevada|utah|colorado|louisiana|mississippi|
alabama|georgia|tennessee|kentucky|ohio|michigan|illinois|wisconsin|minnesota|iowa|nebraska|virginia|
maine|vermont|massachusetts|connecticut|new jersey|pennsylvania|hawaii|oregon|idaho|dakota|appalachia`);

const PLACE_PATTERN = /^[a-z .'\-()]+, [a-z .'\-]+$/; // "paris, france", "tokyo, japan", "wyoming, usa"

// Concepts: catalogue keywords that say the same thing in different words are
// gathered into one trait, so "adultery", "infidelity" and "extramarital
// affair" connect the same films. [key, light, kind, weight, label, short, members]
const CONCEPTS = [
  ['affair', 'story', 'event', 0.7, 'an affair', 'Affairs', 'adultery|infidelity|extramarital affair|cheating|deceived husband|adulterous wife|love affair|mistress'],
  ['forbidden-love', 'story', 'event', 0.7, 'a forbidden love', 'Forbidden Love', 'forbidden love|secret love|tragic love|fugitive lovers|runaway couple|unrequited love|lovesickness'],
  ['marriage-apart', 'story', 'event', 0.7, 'a marriage coming apart', 'Marriages Coming Apart', 'marriage crisis|failing marriage|divorce|break-up|violent husband|domestic violence'],
  ['triangle', 'story', 'event', 0.7, 'a love triangle', 'Love Triangles', 'love triangle|woman between two men'],
  ['murder', 'story', 'event', 0.6, 'a murder', 'Murders', 'murder|murderer|killer|murder plot|attempted murder|suspicion of murder|crime of passion|child murder|dead body|corpse|strangulation|poison'],
  ['serial-killer', 'story', 'event', 0.75, 'a serial killer', 'Serial Killers', 'serial killer|series of murders|killing spree|mass murder|slasher|proto-slasher|psychopath|psycho'],
  ['inquiry', 'story', 'event', 0.65, 'an investigation', 'Investigations', 'investigation|murder investigation|detective|private detective|whodunit|murder mystery|police procedural|interrogation|suspicion|clue'],
  ['vengeance', 'story', 'event', 0.7, 'revenge', 'Revenge', 'revenge|vengeance|rape and revenge|vigilante|payback'],
  ['kidnap', 'story', 'event', 0.7, 'a kidnapping', 'Kidnappings', 'kidnapping|hostage|ransom|abduction|held captive'],
  ['missing', 'story', 'event', 0.7, 'a disappearance', 'Disappearances', 'missing person|disappearance|search'],
  ['heist', 'story', 'event', 0.7, 'a robbery', 'Robberies', 'robbery|heist|bank robbery|hold-up robbery|theft|thief|burglary|burglar'],
  ['on-the-run', 'story', 'event', 0.7, 'someone on the run', 'On the Run', 'on the run|fugitive|escape|prison escape|attempt to escape|chase|police chase|manhunt'],
  ['false-identity', 'story', 'event', 0.7, 'a false identity', 'False Identities', 'con man|deception|fake identity|dual identity|secret identity|double life|forgery|counterfeit|impostor|lie|undercover|undercover agent|mistaken identity'],
  ['double-cross', 'story', 'event', 0.7, 'a double cross', 'Double Crosses', 'betrayal|double cross|treason|informer|blackmail'],
  ['self-destruction', 'story', 'event', 0.65, 'a suicide', 'Suicides', 'suicide|suicide attempt'],
  ['road', 'story', 'event', 0.65, 'a journey by road', 'Road Journeys', 'road trip|journey|road movie|car journey|on the road|hitchhiker|travel|expedition|quest|drifter'],
  ['trial', 'story', 'event', 0.7, 'a trial', 'Trials', 'trial|courtroom|court|court case|judge|lawyer|legal drama|legal thriller|courtroom drama|falsely accused|prosecution'],
  ['conspiracy', 'story', 'event', 0.7, 'a conspiracy', 'Conspiracies', 'conspiracy|cover-up|conspiracy thriller|surveillance|espionage|spy|secret agent'],
  ['hired-killer', 'story', 'event', 0.7, 'a hired killer', 'Hired Killers', 'hitman|assassin|assassination|political assassination|contract killer|sniper'],
  ['rescue', 'story', 'event', 0.6, 'a rescue', 'Rescues', 'rescue|rescue mission|saving the world|mission'],
  ['survive', 'story', 'event', 0.65, 'survival', 'Survival', 'survival|struggle for survival|human vs nature|trapped|shipwreck|disaster|survival horror'],
  ['time-loop', 'story', 'event', 0.75, 'time out of joint', 'Time Out of Joint', 'time travel|time-travel|time machine|parallel world|premonition|prophecy'],
  ['telling', 'story', 'event', 0.6, 'told out of order', 'Shuffled Time', 'flashback|told in flashback|nonlinear timeline|multiple storylines|film within a film'],

  ['loss', 'idea', 'theme', 0.7, 'grief', 'Grief', 'loss of loved one|death of husband|loss of child|grief|grieving|mourning|funeral|widow|loss'],
  ['mortality', 'idea', 'theme', 0.65, 'mortality', 'Mortality', 'dying and death|death|mortality|terminal illness|life and death|afterlife|cancer|old age|aging'],
  ['growing-up', 'idea', 'theme', 0.7, 'growing up', 'Growing Up', 'coming of age|becoming an adult|sexual awakening|puberty|rebellious youth|teenage girl|teenage boy|juvenile delinquent|childhood|teenager|high school|school'],
  ['mind', 'idea', 'theme', 0.7, 'a mind coming apart', 'Minds Coming Apart', 'mental illness|insanity|madness|schizophrenia|psychosis|mental breakdown|descent into madness|delusion|loss of sense of reality|hallucination|paranoia|depression|psychiatrist|insane asylum|psychiatric hospital'],
  ['addiction', 'idea', 'theme', 0.7, 'addiction', 'Addiction', 'alcoholism|alcoholic|drunkenness|alcohol|drug addiction|drugs|drug abuse|heroin|addiction|drug use|drunk'],
  ['sex-work', 'idea', 'theme', 0.7, 'sex work', 'Sex Work', 'prostitute|prostitution|brothel|illegal prostitution|courtesan|geisha|pimp|brothel madam'],
  ['queer', 'idea', 'theme', 0.7, 'queer lives', 'Queer Lives', "lgbt|gay theme|male homosexuality|lesbian relationship|lesbian|queer|homophobia|boys' love (bl)"],
  ['poverty', 'idea', 'theme', 0.7, 'poverty', 'Poverty', 'poverty|homelessness|homeless person|unemployment|unemployed|hunger|slum|debt|working class|famine'],
  ['class', 'idea', 'theme', 0.7, 'class', 'Class', 'class differences|class|class struggle|class society|upper class|bourgeoisie|high society|wealth|wealthy family|servant|maid|money|greed|capitalism'],
  ['faith', 'idea', 'theme', 0.7, 'faith and the spirit', 'Faith', 'religion|faith|christianity|catholicism|catholic|church|priest|nun|crisis of faith|spirituality|buddhism|bible|pastor|saint|sin|roman catholic church|religious fundamentalism'],
  ['politics', 'idea', 'theme', 0.7, 'politics and power', 'Politics', 'politics|government|authoritarian|fascism|communism|revolution|rebellion|protest|student protest|students\' movement|political thriller|political corruption|corruption|bureaucracy|oppression'],
  ['race', 'idea', 'theme', 0.7, 'race and racism', 'Race and Racism', 'racism|race relations|antisemitism|slavery|interracial relationship|colonialism'],
  ['family', 'idea', 'relation', 0.6, 'family', 'Families', 'family|family relationships|dysfunctional family|family drama|family history|japanese family'],
  ['parents', 'idea', 'relation', 0.65, 'parents and children', 'Parents and Children', 'parent child relationship|mother son relationship|father son relationship|father daughter relationship|mother daughter relationship|father son conflict|single mother|single father|orphan|adoption'],
  ['siblings', 'idea', 'relation', 0.65, 'brothers and sisters', 'Brothers and Sisters', 'sibling relationship|brother brother relationship|brother sister relationship|sister sister relationship|twins|brother|sister'],
  ['marriage', 'idea', 'relation', 0.6, 'marriage', 'Marriage', 'marriage|married couple|husband wife relationship|wedding|arranged marriage|marriage proposal|honeymoon|housewife'],
  ['friendship', 'idea', 'relation', 0.6, 'friendship', 'Friendship', 'friendship|male friendship|female friendship|best friend|childhood friends|buddy'],
  ['loneliness', 'idea', 'theme', 0.7, 'loneliness', 'Loneliness', 'loneliness|isolation|alienation|unsociability'],
  ['watching', 'idea', 'theme', 0.7, 'obsession', 'Obsession', 'obsession|sexual obsession|stalking|stalker|voyeurism|jealousy'],
  ['past', 'idea', 'theme', 0.7, 'memory', 'Memory', 'memory|memories|amnesia|memory loss|nostalgia|haunted by the past|childhood trauma|regret|guilt|guilty conscience'],
  ['selfhood', 'idea', 'theme', 0.65, 'identity', 'Identity', 'identity|identity crisis|doppelgänger|transformation'],
  ['filmmaking', 'idea', 'theme', 0.75, 'the making of films', 'The Making of Films', 'movie business|filmmaking|film director|hollywood|screenwriter|actress|movie star|documentary filmmaking'],
  ['artists', 'idea', 'theme', 0.65, 'artists at work', 'Artists at Work', 'artist|painter|writer|author|composer|musician|pianist|singer|photographer|playwright|art|poetry|writing|jazz singer or musician'],
  ['violence', 'idea', 'theme', 0.6, 'violence and what it costs', 'Violence', 'violence|brutality|cruelty|sadism|torture|police brutality|war crimes|massacre|genocide'],
  ['desire', 'idea', 'theme', 0.6, 'desire', 'Desire', 'sexuality|eroticism|seduction|lust|sexual frustration|fetish|sadomasochism|love|romance|falling in love|new love'],
  ['existence', 'idea', 'theme', 0.7, 'what a life is for', 'What a Life Is For', 'existentialism|philosophy|nihilism|human nature|humanity|fate|destiny|morality|moral dilemma|freedom'],

  ['underworld', 'world', 'tradition', 0.65, 'the criminal underworld', 'The Underworld', 'gangster|mafia|organized crime|yakuza|mobster|criminal underworld|gang|gang war|street gang|sicilian mafia|crime family|criminal|drug dealer|drug trafficking'],
  ['supernatural', 'world', 'being', 0.65, 'the supernatural', 'The Supernatural', 'supernatural|paranormal phenomena|occult|witchcraft|witch|curse|possession|demonic possession|ritual|demon|devil|satan|magic'],
  ['ghosts', 'world', 'being', 0.7, 'ghosts', 'Ghosts', 'ghost|spirit|haunted house|ghost story|afterlife'],
  ['monsters', 'world', 'being', 0.7, 'monsters', 'Monsters', 'monster|creature|vampire|zombie|werewolf|dracula|mutant|cannibal|giant monster|kaiju'],
  ['aliens', 'world', 'being', 0.7, 'visitors from elsewhere', 'Visitors from Elsewhere', 'alien|alien life-form|extraterrestrial technology|flying saucer|alien invasion|alien contact|alien planet'],
  ['space', 'world', 'placetype', 0.7, 'space', 'Space', 'space|space travel|spacecraft|space battle|space colony|astronaut|galaxy|planet|space opera|space marine|planet mars|spaceship|space station'],
  ['machines', 'world', 'being', 0.7, 'thinking machines', 'Thinking Machines', 'robot|android|cyborg|artificial intelligence (a.i.)|artificial intelligence|man vs machine|transhumanism|cyberpunk'],
  ['ruined-future', 'world', 'period', 0.7, 'a ruined future', 'Ruined Futures', 'post-apocalyptic future|dystopia|apocalypse|future|futuristic|distant future'],
  ['ww2', 'world', 'period', 0.7, 'the Second World War', 'The Second World War', 'world war ii|nazi|nazi occupation|the holocaust|holocaust|concentration camp|pacific war|post world war ii|resistance|third reich'],
  ['soldiering', 'world', 'tradition', 0.6, 'soldiers and war', 'Soldiers and War', 'war|soldier|army|military|battle|battlefield|soldiers|anti war|world war i|vietnam war|korean war|prisoner of war|japanese soldier|us army|british army'],
  ['samurai', 'world', 'period', 0.75, 'samurai Japan', 'Samurai Japan', 'samurai|ronin|jidaigeki|feudal japan|edo period|sengoku period|bakumatsu|shogunate|sword fight|swordplay|samurai film'],
  ['the-west', 'world', 'tradition', 0.75, 'the American West', 'The American West', 'western|wild west|cowboy|gunslinger|outlaw|spaghetti western|neo-western|saloon|gunfighter'],
  ['noir', 'world', 'tradition', 0.75, 'noir', 'Noir', 'film noir|neo-noir|french noir|japanese noir|tech noir|femme fatale'],
  ['country-life', 'world', 'placetype', 0.6, 'village and country', 'Village and Country', 'small town|village|rural area|countryside|rural setting|farm|farmer|peasant'],
  ['the-sea', 'world', 'placetype', 0.6, 'the sea', 'The Sea', 'sea|ship|boat|sailor|island|beach|pirate|ocean|seaside town|fishing'],
  ['behind-bars', 'world', 'placetype', 0.7, 'prison', 'Prison', 'prison|jail|ex-con'],
  ['night-town', 'world', 'placetype', 0.6, 'bars, clubs and casinos', 'Night Town', 'nightclub|night life|casino|bar|gambling|gambler'],
  ['police', 'world', 'tradition', 0.55, 'cops and crime', 'Cops and Crime', 'police|policeman|police officer|police chief|fbi'],
  ['fighting-arts', 'world', 'tradition', 0.7, 'martial arts', 'Martial Arts', 'martial arts|kung fu|karate|wuxia|judo|martial artist|shaolin'],
  ['flight', 'world', 'placetype', 0.6, 'pilots and aircraft', 'Flight', 'aviation|pilot|airplane|aircraft|airport|air force|fighter pilot|airplane crash|plane crash|flying'],
  ['the-ring', 'world', 'placetype', 0.6, 'sport and the ring', 'Sport', 'boxing|sports|baseball|boxer|football|soccer|horse racing|car race|olympic games|wrestling|basketball|sport'],
  ['terror', 'story', 'event', 0.7, 'a terror plot', 'Terror Plots', 'terrorism|terrorist|terrorist plot|bomb|bombing|hijacking|hostage-taking'],
];

const CONCEPT_OF = new Map();
for (const [key, light, kind, weight, label, short, members] of CONCEPTS) {
  for (const member of members.split('|')) CONCEPT_OF.set(member.trim(), { key, light, kind, weight, label, short });
}

/** The concept a keyword belongs to, if any. */
export const conceptFor = keyword => CONCEPT_OF.get(String(keyword).toLowerCase().trim()) || null;

/** Returns { light, kind, weight } for a keyword, or null when it says nothing about likeness. */
export function classifyKeyword(keyword) {
  const k = keyword.toLowerCase().trim();
  if (!k || DROP.has(k)) return null;
  const concept = CONCEPT_OF.get(k);
  if (concept) return { light: concept.light, kind: concept.kind, weight: concept.weight, concept };
  if (MOOD.has(k)) return { light: 'feeling', kind: 'mood', weight: 0.4 };
  if (FORM.has(k)) return { light: 'image', kind: 'form', weight: 0.65 };
  if (MOVEMENT.has(k)) return { light: 'hands', kind: 'movement', weight: 0.6 };
  if (TRADITION.has(k)) return { light: 'world', kind: 'tradition', weight: 0.6 };
  if (BEING.has(k)) return { light: 'world', kind: 'being', weight: 0.6 };
  if (PERIOD.test(k)) return { light: 'world', kind: 'period', weight: 0.6 };
  if (PLACES.has(k) || PLACE_PATTERN.test(k)) return { light: 'world', kind: 'place', weight: 0.5 };
  if (PLACETYPE.has(k)) return { light: 'world', kind: 'placetype', weight: 0.5 };
  if (EVENT.has(k)) return { light: 'story', kind: 'event', weight: 0.6 };
  if (ROLE.has(k)) return { light: 'story', kind: 'role', weight: 0.35 };
  if (RELATION.has(k)) return { light: 'idea', kind: 'relation', weight: 0.55 };
  if (THEME.has(k)) return { light: 'idea', kind: 'theme', weight: 0.6 };
  if (ICON.has(k)) return { light: 'image', kind: 'icon', weight: 0.25 };
  return { light: 'idea', kind: 'motif', weight: 0.2 };
}
