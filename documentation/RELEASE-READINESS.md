# Piano di produzione e distribuzione

Stato al 2026-09-08, contro la versione pubblicata **1.0.24**.

> **1.0.24 pubblicata l'8 settembre.** Chiude C8, l'ultimo difetto aperto e l'unico trovato oggi che
> riguardasse gli utenti: sotto una allowlist esplicita senza il tool `Workflow`, `/cycle:run` non
> poteva avviare un workflow e non lo diceva — il modello faceva il lavoro a mano, e restavano file
> modificati, una risposta che diceva "fatto", e nessun candidato, gate, revisione o record. La
> skill ora si ferma e dice quale delle due cause è; il README lo elenca fra i requisiti.
>
> **1.0.23 pubblicata il 7 settembre.** Chiude i blocchi C e D. La politica di evidenza legge ciò
> che una modifica *raggiunge* e non solo ciò che tocca; la reach porta una confidenza e un "non lo
> so" è una prova registrata; l'indice smette di camminare il filesystem quando git rifiuta.
>
> **Dove sta il cancello.** Su entrambe le piattaforme restano tre righe, e tutte e tre chiedono
> una persona davanti all'applicazione: la scheda errori di `/plugin`, `/reload-plugins`, e la
> richiesta dei valori all'abilitazione. Tutto il resto è verde: 129 righe su Windows, 127 su WSL.
>
> **Due righe manuali in meno per sempre.** 1.6 e 2.2 chiedevano due cose ciascuna e solo una aveva
> bisogno di occhi: la metà verificabile è ora automatica nelle righe 1.14 e 2.10. La 4.7 ha un
> banco che uccide la sessione a metà ciclo e verifica la riattaccatura, quindi non è più
> un'attestazione. Con 1.3, 1.4 e 1.5 automatizzate ieri, un bump riapre tre righe operatore invece
> di sette.
>
> Archivio riproducibile su questa macchina, su WSL e sul runner UTC della CI, con attestazione di
> provenienza che verifica dall'esterno.

> **1.0.19 pubblicata il 2026-09-06, la sera stessa della 1.0.18.** Chiude A9 e A10, i due
> difetti che la riga 13.6 ha scoperto eseguendo un ciclo completo sull'artefatto installato. Ogni
> riga automatizzata della matrice passa contro la 1.0.19 su Windows, sette suite su sette, CI
> verde su entrambe le piattaforme, digest pubblicato identico a quello fissato dal marketplace.
>
> **Le sei righe manuali chiuse oggi contro la 1.0.18 sono tornate aperte.** La matrice lega ogni
> attestazione manuale alla versione, quindi il bump le ha scadute: è il costo strutturale
> previsto, ed è il motivo per cui automatizzarne una parte è lavoro del blocco C e non un lusso.
> Restano dieci righe non registrate sulla 1.0.19: le sei scadute più le quattro mai chiuse.
> WSL non ancora eseguita su questa versione.
>
> Il riquadro che segue descrive la 1.0.18 e resta come registro.

> **1.0.18 è stata pubblicata il 2026-09-06 con il cancello rosso, deliberatamente.**
> Ogni riga automatizzata della matrice passa contro questa versione, la CI è verde su entrambe le
> piattaforme, e l'archivio pubblicato è stato riscaricato e verificato: digest identico a quello
> fissato dal marketplace, validazione `--strict` superata, server che risponde 1.0.18.
>
> `CERTIFICATION.md` dice che una riga manuale senza risultato registrato blocca il rilascio, ed è
> vero. È uscita comunque perché la 1.0.17 in circolazione aveva un confine che non applicava nulla,
> e trattenere quella correzione era il rischio maggiore. Il changelog e le note di rilascio lo
> dichiarano invece di lasciarlo dedurre.
>
> **Stato del cancello dopo la sessione del 2026-09-06:** da dieci righe bloccanti a quattro. Chiuse
> 1.3, 1.4, 1.5, 3.5, 8.7 e 13.6. Le quattro rimaste richiedono una persona davanti
> all'applicazione, e va ancora ripetuto tutto su WSL.
>
> **La riga 13.6 ha però scoperto due difetti nuovi, A9 e A10, entrambi presenti nella 1.0.18.**
> Il ciclo governato si è chiuso e ogni livello ha fatto il suo lavoro, ma la chiamata di consegna
> può perdersi lasciando lavoro approvato non committato, e il commit consegnato dichiara zero gate
> mentre ne ha sei. Servono una 1.0.19 e, per A10, una correzione al trailer che è la prova
> verificabile su cui poggia la promessa del prodotto.

Questo documento elenca ciò che manca per dichiarare il plugin pronto alla produzione e alla
distribuzione. Ogni voce riporta la prova che l'ha originata e il criterio con cui si considera
chiusa. Le prove sono state raccolte eseguendo i banchi, non solo leggendo il codice.

---

## Verdetto

**Non pronto.** Lo strumento di certificazione del progetto, eseguito sulla versione pubblicata,
chiude così:

```
evidenced: 114  ·  unrecorded: 10  ·  n/a: 6  ·  pass: 1
10 rows block release on win.
```

`CERTIFICATION.md` stabilisce che la pubblicazione richiede ogni riga passata e registrata con la
versione. La 1.0.17 è uscita comunque.

A questo si aggiunge un problema più grave, che la matrice non poteva vedere: **dodici righe sono
verdi grazie a un banco che non può fallire**.

### Cosa invece regge

Da non rifare. Verificato il 2026-09-04.

| Verifica | Esito |
| --- | --- |
| `npm run check` completo | esce 0, 467 test passati, 1 saltato per piattaforma |
| Digest dell'archivio ricostruito contro la release pubblicata | identico (`7bad8981…`) |
| `claude plugin validate --strict` su repository e artefatto estratto | passa entrambi |
| `tests-debug/install.mjs` | passa, ed è un banco con asserzioni vere |
| Installazione da archivio con digest fissato | funziona, la copia installata contiene solo i file di produzione |

---

## Blocco A — blocca il rilascio

### A1. `cycle-e2e.mjs` non contiene una sola asserzione — CHIUSO 2026-09-06

**Prova.** `certify.mjs` esegue il banco e lo giudica solo dal codice di uscita:

```js
const ok = outcome.status === 0
```

Nel banco, la ricerca di `assert`, `throw` e `process.exit` trova quattro occorrenze: una è il
controllo degli argomenti, tre stanno dentro file finti che il banco stesso scrive. Non esiste
nessuna asserzione sul risultato. Il banco esce zero qualunque cosa accada.

Le righe che dipendono da lui: **4.2, 4.3, 4.7, 5.1, 5.2, 5.19, 5.20, 5.21, 6.4, 7.2, 7.3, 7.5**.

**Da fare.** Accumulare i fallimenti e uscire non zero, sul modello di `install.mjs`, che lo fa già
correttamente. In particolare il banco deve fallire quando una risposta arriva priva di `state`:
oggi `body()` trasforma un errore dello strumento in `{_raw: text}`, e il chiamante lo stampa come
`approved`.

**Fatto quando.** Introdurre deliberatamente un difetto nel control plane fa fallire il banco.

**Chiuso.** Settanta asserzioni, `failures` accumulato e `process.exit(1)` finale, sulla forma che
`install.mjs` già usava. `accepted()` fallisce quando una risposta torna senza `state`, che è la
cecità specifica per cui un errore veniva stampato come `approved`. La dimostrazione che ora sa
fallire non è teorica: eseguito contro il difetto A2 ancora presente, ha prodotto trentadue
fallimenti e uscita 1, con la prima riga dell'elenco che nominava la causa di tutte le altre.

### A2. Il banco non spende il token di cattura, quindi il ciclo completo non consegna — CHIUSO 2026-09-06

**Prova.** Il banco invia la cattura del browser così:

```js
wf({ operation: 'submit_browser_evidence', workflowId, snapshot: capture(button) })
```

Senza `captureToken`. Dalla 1.0.10, che ha chiuso la falla per cui un ruolo poteva superare il gate
che lo controlla, una sottomissione priva di token vale come autodichiarazione dell'esecutore e non
soddisfa il livello di interfaccia.

Eseguendo il banco il 2026-09-04:

| Passo | Esito osservato |
| --- | --- |
| Verifica finale | `2 of 6 mandatory gates did not pass: accessibility:affected-user-flow, browser:affected-user-flow` |
| Arbitrato | stampa `approved`, stato `undefined` |
| Consegna | stato `undefined`, nessuna riga scritta |
| Albero di lavoro | non pulito, commit ancora `"baseline"` |
| Riconciliazione | `repair` |

La correzione di sicurezza della 1.0.10 ha rotto in silenzio il banco che certifica dodici righe, e
nessuno se ne è accorto perché quel banco non asserisce.

**Da fare.** Leggere `captureCapabilities` dalla risposta di `freeze_candidate` e passare il token
del revisore in `submit_browser_evidence`.

**Fatto quando.** Il banco arriva a `state: completed`, l'albero di lavoro è pulito e il commit
finale non è più `baseline`.

**Chiuso, ed erano due cause, non una.**

La prima è il token: `verifiedCandidate` legge ora `captureCapabilities` dalla risposta del freeze e
spende quello del revisore funzionale. La seconda era invisibile finché la prima non è stata
risolta: le prove di sicurezza sono spente per impostazione predefinita dalla 1.0.9, quindi
`run_proof` veniva rifiutato e la scena che il banco dichiara nella sua intestazione, una prova
dimostrata che rifiuta la consegna già approvata, non poteva accadere. Il banco imposta ora
`CLAUDE_PLUGIN_OPTION_SECURITY_PROOFS=on` sul processo figlio, contro un repository usa e getta e
uno store isolato.

Esito, ripetuto due volte con directory temporanee nuove:

| Passo | Prima | Adesso |
| --- | --- | --- |
| Prova di sicurezza | rifiutata, `inconclusive` | `DEMONSTRATED`, `security:proof:sql-injection` |
| Arbitrato sul candidato con la prova | errore stampato come `approved` | `repair`, "approval refused: mandatory verification gates have not passed" |
| Verifica del terzo candidato | `false`, 2 gate su 6 falliti | `true`, 6 gate obbligatori passati |
| Consegna | nessuna riga scritta | `completed`, 5 file consegnati e riverificati |
| Albero di lavoro e commit | sporco, `"baseline"` | pulito, `"add a login screen with oauth"` |
| Memoria appresa | 0 | 2 voci `verified` con 7 evidenze |
| Goal | milestone `active`, 0 continuazioni | milestone `completed`, 1 continuazione |

Nessuna modifica a `production/`: il difetto era interamente nel banco.

### A3. Il guard non blocca il tool con cui oggi si generano i subagent — CHIUSO 2026-09-06

**Prova.** Claude Code ha rinominato `Task` in `Agent` dalla versione 2.1.63. Eseguendo il guard
distribuito:

```bash
node --input-type=module -e "import {decide} from './hooks/guard.mjs'; console.log(decide({agent_type:'cycle:arbiter',tool_name:'Agent',tool_input:{prompt:'x'}}))"
```

Restituisce `null`, cioè consentito. Inoltre il matcher in `hooks/hooks.json` elenca `Task` e non
`Agent`, quindi il hook non viene neppure invocato, e nessun file di agente nomina `Agent`.

Il secondo dei tre livelli di separazione dei poteri è cieco alla delega. Il terzo, la
riconciliazione, confronta solo i percorsi scritti e non vede una delega affatto.

**Da fare.** Aggiungere `Agent` al matcher, all'insieme dei tool rifiutati nel guard e ai
`disallowedTools` di ogni agente.

**Fatto quando.** `tests/hook-guard.test.ts` copre entrambi i nomi per ogni ruolo di sola lettura.

**Chiuso.** Otto punti allineati, perché il nome del tool era dichiarato in otto posti e correggerne
uno solo avrebbe fatto divergere la tabella dai file che i test asseriscono contro di essa:

| Punto | Modifica |
| --- | --- |
| `hooks/hooks.json` | il matcher elenca `Agent`, altrimenti il hook non viene neppure invocato |
| `hooks/guard.mjs` | `SUBAGENT_TOOLS` con entrambi i nomi, al posto del confronto con `Task` |
| `agents/*.md`, sette file | `disallowedTools` dichiara `Agent` oltre a `Task` |
| `src/roles.ts` | `READ_ONLY_TOOLS` e la riga dell'esecutore |
| `src/server.ts` | il testo che `/cycle:permissions` riporta |
| `README.md` | "a subtask" diventa "a subagent" |
| `tests/hook-guard.test.ts` | entrambi i nomi per sei ruoli invece di un nome per quattro |
| `tests/roles.test.ts` | la lista dichiarata è ora confrontata per voce e non per sottostringa |

Quest'ultimo punto non era in programma ed è emerso leggendo il test: `declared.includes("Edit")`
era soddisfatto da `NotebookEdit`, quindi la voce che quel test esiste per pretendere poteva mancare
del tutto senza che nessuno se ne accorgesse. Stessa classe di problema di A1, trovata mentre la si
correggeva altrove.

Verificato: il guard nega entrambi i nomi per tutti e sette i ruoli, lascia passare una sessione
utente senza ruolo e una chiamata di un altro plugin. `npm run check` esce 0 con 467 test passati, e
il ciclo end to end resta verde.

### A4. Dieci righe manuali bloccano il rilascio — SEI CHIUSE, QUATTRO APERTE

**Prova.** `node tests-debug/certify.mjs --audit` sulla 1.0.17.

| Riga | Cosa verifica | Ultima registrazione |
| --- | --- | --- |
| 1.3 | installazione da marketplace locale | 1.0.10 |
| 1.4 | i sette agenti compaiono in `/context` | 1.0.10 |
| 1.5 | le skill compaiono in `/help` | 1.0.10 |
| 1.6 | il server MCP parte senza errori | 1.0.10 |
| 1.7 | `/reload-plugins` applica le modifiche | 1.0.10 |
| 2.2 | `userConfig` chiede i valori e li conserva | 1.0.10 |
| 3.5 | i cinque comandi consultivi | 1.0.10 |
| 4.7 | applicazione chiusa a metà ciclo | 1.0.10 |
| 8.7 | corpus da cinquecentomila file | 1.0.10 |
| 13.6 | l'artefatto installato esegue un ciclo completo | 1.0.0 |

La 1.6 merita attenzione particolare: all'avvio di una sessione il server del plugin è andato in
timeout dopo trenta secondi, mentre avviato da solo risponde in poco più di un secondo. Va riprodotto
prima di firmare quella riga.

**Fatto quando.** `certify.mjs` non stampa più righe bloccanti, su Windows e su WSL, contro la
versione che si sta per pubblicare.

**Stato al 2026-09-06, contro la 1.0.18 su Windows.** La metà automatizzata è chiusa: tutte e sette
le suite passano, incluso il banco end to end che ora sa fallire, e ogni riga automatizzata è verde.

```
pass: 115  ·  unrecorded: 10  ·  n/a: 6
10 rows block release on win.
```

**Aggiornamento 2026-09-06.** Tre delle dieci sono state chiuse. La stima iniziale che nessuna fosse
eseguibile senza una persona era troppo pessimista: `claude plugin details` fa enumerare all'host
l'inventario dei componenti dell'artefatto installato, che è la sostanza di due righe, e
`claude plugin install --config` scrive per lo stesso percorso del flusso interattivo.

Chiuse, contro un'installazione isolata della 1.0.18 fatta dal marketplace pubblico:

| Riga | Come | Esito |
| --- | --- | --- |
| 1.3 | `marketplace add` più `install` su una `CLAUDE_CONFIG_DIR` isolata | 1.0.18, 119 file, digest fissato rispettato |
| 1.4 | `claude plugin details` | `Agents (7)`, i sette nomi attesi |
| 1.5 | `claude plugin details` | `Skills (24)`, ogni directory di `skills/` |
| 3.5 | i cinque comandi consultivi contro modelli reali | ognuno consiglia, nessuno implementa |
| 8.7 | `index-scale.mjs` su cinquecentomila file | primo indice completo, delta limitato a un file |
| 13.6 | ciclo completo sull.artefatto installato, rotta piena | consegnato, ma ha scoperto A9 e A10 |

Per la 3.5 l'archivio pubblicato è stato caricato con `--plugin-url`, così i byte esercitati sono
quelli rilasciati e non un albero di lavoro. Dopo tutti e cinque i comandi la fixture aveva l'albero
pulito e HEAD fermo. Ogni ruolo ha dichiarato il proprio confine senza che nulla glielo chiedesse:
l'architetto "advisory only", l'esecutore "Nothing here is implemented or approved", i due revisori
"not a release approval", l'arbitro "This is not an approval". Al primo tentativo, prima che gli
strumenti del control plane fossero concessi, `/cycle:architect` ha rifiutato di indovinare un agente
sostitutivo e ha riportato il passo bloccato, che è il comportamento documentato.

Restano quattro, e per ciascuna il motivo per cui resta:

| Riga | Cosa manca davvero |
| --- | --- |
| 1.6 | il server parte in circa 430 ms contro lo store reale, senza stderr, e risponde con dieci strumenti; la scheda errori del plugin è però una superficie dell'interfaccia che nessun processo legge |
| 1.7 | `/reload-plugins` è un comando dell'applicazione in esecuzione |
| 2.2 | i valori passati con `--config` risultano in `settings.json`, ma la richiesta all'abilitazione è interfaccia, e la sostituzione `${user_config.x}` la fa l'host quando avvia il server |
| 4.7 | chiudere e riaprire l'applicazione a metà ciclo |

Tutte e quattro richiedono l'applicazione in esecuzione o una persona che guardi, e si chiudono in
un'unica sessione perché guardano la stessa installazione.

**WSL, eseguita per intero il 2026-09-06 contro la 1.0.19.** Sette suite su sette verdi, 113 righe
automatizzate passate, e la riga 12.9 sulla parità dei runtime è `ok`: Node 26.3.0 su entrambe le
piattaforme. Le dieci righe manuali aperte erano le stesse dieci di Windows.

Il primo giro era rosso su 122 righe in due minuti, per due cause ambientali e nessuna del prodotto:

| Suite | Causa | Rimedio |
| --- | --- | --- |
| `install` | l'archivio impacchettato mancava, escluso dalla sincronizzazione | `npm run package` nella copia WSL |
| `platform` | git rifiutava ogni repository su `/mnt/c` con "dubious ownership" | il `.gitconfig` di root aveva una voce `safe.directory` **vuota** che azzerava il `*`; rimossa, con copia di sicurezza |

La seconda causa è annotata in memoria, perché è il genere di cosa che la sessione successiva
riscopre da zero. `platform.mjs` in quel caso va in crash con uno stack grezzo invece di una riga
`FAIL`: esce comunque con 1, quindi la matrice lo conta, ma è meno leggibile di quanto dovrebbe.

Dopo il rimedio, sulla 1.0.19 e su entrambe le piattaforme:

| Riga | Windows | WSL |
| --- | --- | --- |
| 1.3 installazione dal marketplace pubblico | 119 file, opzioni persistite | idem |
| 1.4 sette agenti | `Agents (7)` | `Agents (7)` |
| 1.5 ventiquattro skill | `Skills (24)` | `Skills (24)` |
| 13.6 ciclo completo | fatto sulla 1.0.18, ha trovato A9 e A10 | in esecuzione |

Per la 13.6 su WSL il percorso è deliberatamente quello che A9 ha corretto: `/cycle:run` in una
sessione non interattiva, che muore con la sessione, poi `/cycle:resume` in una seconda. Se la
riconciliazione consegna e il commit nomina i gate, i due difetti sono chiusi sul prodotto
installato, su una seconda piattaforma, attraverso l'host reale e non solo il server.

La config viva di WSL puntava a un marketplace `Directory (/root/cycle-plugin)` fermo ad agosto:
ora punta a GitHub ed è alla 1.0.19 con i sei valori di configurazione ripristinati.

**Cancello sulla 1.0.20, a fine sessione del 2026-09-07.** La matrice automatizzata è stata
rieseguita su entrambe le piattaforme contro la versione pubblicata.

| | Windows | WSL |
| --- | --- | --- |
| Suite | 7 su 7 verdi | 7 su 7 verdi |
| Righe automatizzate passate | 118 | 117 |
| Righe manuali bloccanti | 7 | 6 |
| Digest dell'archivio ricostruito | `692b093f…` | `692b093f…`, identico |

Le righe 1.3, 1.4 e 1.5 sono registrate sulla 1.0.20 per entrambe le piattaforme, la 13.6 su WSL.
Le sei di WSL sono 1.6, 1.7, 2.2, 4.7, che richiedono una persona davanti all'applicazione, più 3.5 e
8.7, che sono spesa e tempo. Windows ha in più la 13.6, registrata sulla 1.0.18.
Restano sette bloccanti per piattaforma: 1.6, 1.7, 2.2 e 4.7, che richiedono una persona davanti
all'applicazione, più 3.5, 8.7 e 13.6.

**La 13.6 è chiusa su WSL sulla 1.0.20, alla lettera.** Artefatto installato in
`plugins/cache/cycle/cycle/1.0.20`, fixture nuova, due sessioni non interattive come il README
descrive: `/cycle:run` in una, `/cycle:resume` nella successiva. I revisori si sono divisi di nuovo
sullo stesso gap reale, e stavolta l'arbitro ha rifiutato al primo dispatch: riparazione, seconda
coppia di revisioni, approvazione, consegna.

| | |
| --- | --- |
| Stato finale | `route full · state completed · tasks 1/1 · reviews 4 · arbitrations 2 · repair 1/5 · delivered` |
| Commit | `27db07a`, "on 7 recorded gates and an independent arbitration" |
| Albero | pulito, quattro test verdi |
| Cronologia | 161–176 completa, `arbitration.rejected` registrato per nome al 168 |
| Costo | 5,24 dollari in due sessioni, ventitré minuti |

Una sola esecuzione ha esercitato tutte e tre le correzioni di questa sessione sul prodotto
pubblicato: A9 nella ripresa fra sessioni, A10 nel conteggio dei gate, A11 nell'arbitro che vede la
divisione e converge. La storia della riga in tre versioni: sulla 1.0.18 ha trovato A9 e A10, sulla
1.0.19 ha trovato A11, sulla 1.0.20 ha consegnato. È la riga che ha pagato di più e ha reso di più.

Su Windows la 13.6 resta registrata sulla 1.0.18. Rifarla sulla 1.0.20 costa circa sette dollari e
venti minuti; l'installazione viva di Windows è già alla 1.0.20. 3.5 e 8.7 restano scadute col bump;
nulla di ciò che misurano è cambiato in tre rilasci.

**Una cautela sulla misura della 8.7.** Il primo indice ha impiegato 2465 s contro i 1886 s
registrati sulla 1.0.0, ma il numero non è confrontabile: le cinque sessioni della riga 3.5 giravano
sulla stessa macchina durante l'indicizzazione. Il delta, eseguito dopo che avevano finito, è
risultato più veloce del riferimento, 88,6 s contro 121,3 s. La proprietà che la riga esiste per
dimostrare regge in ogni caso: il parse del delta è 0,1 s, cioè proporzionale alla modifica e non al
corpus. Se serve un dato di prestazione da pubblicare, va rifatto a macchina scarica.

WSL non è stata eseguita affatto in questo giro, e la matrice richiede entrambe le piattaforme.
La riga 12.9 confronta il runtime registrato dall'altra piattaforma, quindi resta aperta finché la
seconda esecuzione non esiste.

L'unica delle dieci che può girare senza presidio è la 8.7, con
`node tests-debug/index-scale.mjs`. Chiude una riga su dieci e non sblocca da sola.

Il risultato automatizzato è registrato in `certification-win.json`, ora contro la 1.0.18.

**Come chiudere A4.** Le sette righe di osservazione si chiudono in una sola sessione, perché
guardano la stessa installazione: installare la 1.0.18 dal marketplace, aprire `/context` e `/help`,
controllare la scheda errori del plugin, cambiare un file e lanciare `/reload-plugins`, impostare
un'opzione e riavviare, poi chiudere l'applicazione a metà ciclo e riaprirla. Le due che costano
modelli, i cinque comandi consultivi e il ciclo completo sull'artefatto installato, sono un secondo
passaggio. Ogni risultato va scritto in `certification-results.json` con riga, piattaforma, data e
versione, altrimenti `certify.mjs` continua a contarlo aperto. Poi la stessa cosa su WSL, dove la
riga 12.9 confronta il runtime registrato da questa esecuzione.

### A5. La soglia di Node è incoerente — CHIUSO 2026-09-06

**Prova.**

| File | Valore |
| --- | --- |
| `package.json` | `"node": ">=22.13.0"` |
| `src/diagnostics.ts` | `MINIMUM_NODE_MAJOR = 22` |

Il manifesto dichiara 22.13.0 perché `node:sqlite` è senza flag solo da lì. La diagnostica confronta
solo la major, quindi su Node 22.5 approva e poi lo store non si apre.

**Fatto quando.** Il dottore rifiuta 22.12 e accetta 22.13.

**Chiuso.** Il confronto è su major, minor e patch, in `belowMinimumNode`, esportata perché sia
verificabile senza girare su un Node vecchio. La soglia non è più scritta nel codice: viene letta da
`engines` in `package.json`, con un valore di ripiego se il file non è leggibile. Due dichiarazioni
della stessa soglia sono ciò che le ha fatte divergere, quindi ora ce n'è una sola e un test
asserisce che il dottore imponga esattamente quella che il manifesto dichiara.

Una versione che nessuna delle due parti sa leggere viene rifiutata, non considerata adeguata: è la
stessa regola che l'ammissione già applica alle metriche di sistema.

Tre test aggiunti. Il messaggio dice ora anche perché la soglia esiste, cioè che lo store non si
apre sotto quella versione.

### A6. Il budget di riparazione configurabile non arriva allo script — CHIUSO 2026-09-06

**Prova.** `workflows/cycle.js` riga 383:

```js
while (cycles < 5) {
```

L'opzione `max_repair_cycles` accetta fino a venti. Chi ne imposta dieci ne ottiene cinque.

**Fatto quando.** Il ciclo legge il massimo che il control plane restituisce già in `status`.

**Chiuso.** Il bound del ciclo deriva ora dal budget che il plane riporta nella chiamata `status`
autorevole che lo script fa già subito dopo l'avvio, più uno: un tentativo iniziale, più una
riparazione per ciascuna che il plane è disposto a finanziare. Il cinque resta solo come ripiego per
il caso in cui il relay perda il campo. La riga di log della rotta dichiara ora il budget in uso,
così una configurazione che non è arrivata è visibile invece che silenziosa.

Il plane resta l'autorità: blocca quando il budget è speso e `beginRepair` restituisce null. Il
bound dello script è una fermata per un ciclo che nessuno sta più guidando, non il budget.

Verificato contro il plane reale con tre valori configurati:

| Opzione configurata | `status` riporta | Round derivati dallo script |
| --- | --- | --- |
| 1 | `{"max":1,"used":0}` | 2 |
| 10 | `{"max":10,"used":0}` | 11 |
| 20 | `{"max":20,"used":0}` | 21 |

Prima, tutti e tre davano cinque.

### A7. Il canale di segnalazione vulnerabilità non esiste — CHIUSO 2026-09-06

**Prova.** `SECURITY.md` rimanda al modulo privato di GitHub. L'interrogazione dell'API dice
`{"enabled":false}`.

**Fatto quando.** Il modulo è attivo, oppure `SECURITY.md` indica un contatto che esiste.

**Chiuso.** Abilitata la segnalazione privata sul repository, quindi il canale che `SECURITY.md`
indicava adesso esiste. Verificato: l'interrogazione dell'API risponde `{"enabled":true}`.

Colta l'occasione per una lacuna adiacente: `SECURITY.md` elencava i tre livelli che applicano il
confine di scrittura e non nominava affatto quello sulla delega, che A3 ha appena corretto. Una
policy di sicurezza silenziosa su un confine che il prodotto applica è la stessa deriva che questo
audit sta chiudendo altrove, quindi ora lo dichiara, con entrambi i nomi del tool.

### A8. Il README non dichiara un requisito necessario — CHIUSO 2026-09-06

**Prova.** `/cycle:run` è un dynamic workflow. La documentazione di Claude Code dice che sono
disponibili sui piani a pagamento, che sul piano Pro vanno accesi dalla riga corrispondente in
`/config`, e che un'organizzazione può disattivarli del tutto. La sezione requisiti del README
elenca solo Claude Code, Node e Git.

Senza quella funzione attiva il comando centrale del prodotto non parte, e nulla lo spiega.

**Fatto quando.** La sezione requisiti lo nomina, e `/cycle:doctor` lo segnala quando manca.

**Chiuso, e i requisiti sbagliati erano due.** Il README diceva anche "Node 22 or later", mentre la
soglia reale è 22.13 per la stessa ragione di A5. Entrambi corretti, con la spiegazione di perché
la soglia è una patch e non una major.

Il dottore ha ora un finding `runtime.workflows` di severità `error`, che scatta sulle due vie
visibili da questa macchina: la variabile `CLAUDE_CODE_DISABLE_WORKFLOWS` e `disableWorkflows` nel
file delle impostazioni. Verificato contro il server reale: `report.ok` diventa `false` e il
messaggio nomina quale delle due l'ha spenta.

Quello che il dottore **non** può dire, ed è scritto sia nel codice sia nel README: un piano che non
include la funzione non è visibile da qui. L'assenza del finding significa "nessuna impostazione
leggibile la spegne", mai "disponibile". Un test copre anche i valori che non devono farlo scattare,
perché un controllo che scatta su `0` sarebbe peggio di nessun controllo.

---

### A9. La chiamata di consegna può perdersi, e la riconciliazione non sa distinguerlo — CHIUSO 2026-09-06

Trovato eseguendo la riga 13.6 il 2026-09-06, sulla 1.0.18 pubblicata.

**Prova.** Un ciclo completo ha percorso la rotta piena fino all'arbitrato approvato e poi non ha
consegnato. La cronologia va da 196 a 203, da `workflow.started` a `arbitration.approved`, e **non
contiene alcun evento di consegna**: la chiamata non ha mai raggiunto il control plane. L'operatore
non ha restituito nulla.

`reconcile` ha risposto "delivery was interrupted and could not be finished; inspect the working
tree". Ma non era stata interrotta: non era mai iniziata. `recoverDelivery` non trova il giornale
perché nessuno lo ha scritto, e da quell'assenza la riconciliazione conclude "interrotta" invece di
"mai partita". Sono due situazioni opposte: la prima non va ripetuta, la seconda è sicura da
eseguire. Non sapendole distinguere, la riconciliazione rifiuta di finire un lavoro che era
perfettamente sicuro finire, e lascia modifiche approvate non committate.

Il ciclo si è chiuso solo perché `deliver` è stato chiamato una volta direttamente contro il plane,
dopo aver letto dalla cronologia che nessuna consegna era avvenuta. Un utente non saprebbe farlo, e
la skill di ripresa gli dice esplicitamente di non riprovare.

**Da fare.** La riconciliazione deve leggere la cronologia, non solo il giornale: nessun evento di
consegna significa mai iniziata, e quello è lo stato in cui riprendere è corretto. Il giornale
presente senza un commit resta il caso in cui non si riprova.

**Aggravante.** In una sessione non interattiva il workflow muore con la sessione, quindi questo
scenario è il caso normale e non l'eccezione. Chi mettesse Cycle in una pipeline otterrebbe
l'esecutore che ha già scritto sul disco e nessun revisore mai dispacciato. Il README non lo dice.

**Chiuso, e scrivendo il test è emersa una terza situazione.** `promote` verifica i byte
**prima** di scrivere il giornale, quindi una consegna tentata e abortita non lascia alcuna riga: il
giornale è identico a quello di una consegna mai partita. Il giornale da solo non basta a nessuna
delle tre distinzioni. La cronologia sì, perché il plane registra `delivery.aborted` per nome.

La riconciliazione ora consegna quando non c'è giornale, non c'è riga di consegna e non c'è
`delivery.aborted` in cronologia, cioè quando l'approvazione è registrata e nessuna promozione è
mai cominciata. Passa dallo stesso `deliverCandidate` che usa il ciclo, quindi ogni byte approvato
viene riverificato prima del commit e il plane rifiuta da solo se l'albero si è mosso. Una consegna
tentata e abortita resta l'unico caso lasciato a una persona, e il testo di `next` lo descrive come
tale invece che come "interrotta".

Verificato in tre modi: due test unitari, uno per il caso mai partita e uno per il caso abortita;
il banco end to end; e un probe contro il server reale che replica esattamente lo scenario 13.6,
con un secondo `reconcile` che non muove HEAD. README e skill di ripresa aggiornati.

**Da aggiungere al README nel prossimo rilascio, emerso ripetendo 13.6 su WSL come root.** Claude
Code rifiuta `--permission-mode bypassPermissions` con privilegi di root, "for security reasons".
I container di CI girano come root nella maggior parte dei casi, quindi chi segue il paragrafo sulle
sessioni non interattive e prova la scorciatoia più ovvia trova un rifiuto. La strada che l'host
prescrive è `--allowedTools` con l'elenco esplicito: `Workflow`, `Agent`, gli strumenti di lettura
e scrittura che l'esecutore usa, e i dieci strumenti MCP del control plane. Una riga nel README con
quell'elenco risparmia a ogni pipeline la stessa scoperta.

### A10. Il commit consegnato dichiara zero gate mentre ne sono registrati sei — CHIUSO 2026-09-06

Trovato nello stesso ciclo. Il commit `c7d9d05a` porta questa riga:

```
Delivered by Cycle against the original request, on 0 recorded gates and an independent arbitration.
```

Contro quel candidato sono registrati sei gate, quattro obbligatori, tutti passati.

**Causa.** Il manifesto congelato nasce con `evidenceIds: []`, perché il freeze precede la verifica.
`deliveryOf` lo arricchisce leggendo la tabella delle evidenze, e quell'elenco finisce nel giornale.
Ma `deliveryMessage` costruisce il messaggio dal manifesto **memorizzato**, che l'arricchimento non
ha mai toccato. Due percorsi costruiscono lo stesso manifesto, uno arricchito e uno no: la stessa
forma di deriva di A5.

**Perché nessuno se n'era accorto.** Il test che esiste per questo, "the commit message leads with
the request and records what was approved", verifica il soggetto e i tre trailer e non guarda la
frase sul conteggio. Passa mentre la frase è falsa. Stessa classe di A1.

**Conseguenza.** Ogni commit che Cycle abbia mai consegnato afferma di non poggiare su alcun gate.
Il trailer esiste per rendere la consegna verificabile a distanza di un anno, ed è la parte del
prodotto che sostiene la promessa centrale.

**Da fare.** Un'unica funzione che costruisce il manifesto con le sue evidenze, usata da entrambi i
percorsi, e il test che asserisce il numero.

**Chiuso.** `manifestWithEvidence` in `delivery.ts`, letta sia da `promote` sia da
`deliveryMessage`. Il test sul messaggio del commit registra ora due gate e asserisce "on 2
recorded gates"; un secondo test mostra che il manifesto memorizzato resta vuoto mentre quello con
evidenze elenca i gate in ordine di nome. Il banco end to end ha un'asserzione nuova sul corpo del
commit consegnato, e il probe contro il server reale ha letto "on 5 recorded gates" con cinque
registrati. Prima della correzione, lo stesso percorso scriveva zero.

### A11. Quando i revisori si dividono, l'arbitro non converge: non vede le revisioni e il rifiuto non gli torna — CHIUSO 2026-09-07

Trovato il 2026-09-07 ripetendo la riga 13.6 su WSL, sulla 1.0.19. Il ciclo su Windows non l'aveva
incontrato perché lì entrambi i revisori avevano approvato.

**Prova.** Il revisore di sicurezza (opus) ha rifiutato su REQ-2, con ragione: il piano chiedeva un
tie-break deterministico per nomi uguali, l'esecutore ha usato solo `localeCompare`, e nessun test
crea due omonimi. Il revisore funzionale (sonnet) ha approvato. L'arbitro (fable) ha approvato, e il
plane ha risposto:

```
arbitration cannot approve while a reviewer rejected the candidate
```

Questo è corretto: una bocciatura viva non si scavalca con un'approvazione. Poi lo script ha
ridispacciato l'arbitro, che ha approvato di nuovo ed è stato rifiutato di nuovo. Ventun agenti in
due dispatch. La sessione si è fermata da sola, correttamente, rifiutando di emettere il verdetto al
posto dell'arbitro.

**Tre lacune che si sommano.**

1. `arbiterPrompt(request, evidence, requirements)` non contiene le revisioni. L'arbitro riceve i
   gate e gli identificativi dei requisiti, non i verdetti dei due revisori né i loro finding.
   Giudica su sette gate verdi e approva. Il comando consultivo `/cycle:judge`, su Windows, aveva
   descritto la garanzia come "two independent reviews, and an arbiter seeing all of it": il
   workflow non la implementa. L'arbitro non vede le revisioni.
2. Il prompt non enuncia la regola. Anche vedendo la bocciatura, l'arbitro non sa che non può
   scavalcarla e che il verdetto utile è un rifiuto con `repair_target`.
3. Il plane rifiuta con un `throw` **prima** di registrare: nessuna riga di arbitrato, nessun evento
   in cronologia, `lastRefusal` vuoto. Lo script scarta l'errore del relay, termina, e il
   `/cycle:run` successivo ridispaccia con lo stesso prompt. Due arbitrati rifiutati non hanno
   lasciato traccia nel record che il prodotto promette di tenere: stessa classe di A10.

**Da fare, nell'ordine.**

- Passare all'arbitro le due revisioni, che lo script ha già in mano perché le ha appena inviate:
  decisione, finding, stato per requisito. E dire la regola nel prompt: una bocciatura di un revisore
  vincola; chi dissente rifiuta comunque, con il bersaglio di riparazione e il perché.
- Nel plane, trattare "approvato mentre un revisore ha rifiutato" come già si tratta "approvato ma i
  gate non passano": registrare l'arbitrato, annotare il rifiuto, e instradare a riparazione verso il
  bersaglio del revisore che ha bocciato. Il ciclo converge in un solo dispatch anche se l'arbitro
  sbaglia, e il record dice cosa è successo.
- Il test che oggi asserisce il `throw` va riscritto sul nuovo comportamento, più uno che verifica
  che la cronologia porti l'arbitrato rifiutato.

**Fatto quando.** Il ciclo 13.6 su WSL, ripreso da `arbitration`, va in riparazione con il rifiuto
registrato, l'esecutore corregge il tie-break, la seconda revisione approva, e la consegna nomina i
gate.

**Implementato il 2026-09-07, in attesa della prova sul workflow reale.** Tre modifiche, tutte nel
senso già presente nel codice:

| Dove | Cosa |
| --- | --- |
| `arbitrate` in `service.ts` | l'approvazione contro una bocciatura viva è registrata testuale, rifiutata per nome nella cronologia (`arbitration.refused`), e instradata a riparazione verso il bersaglio del revisore che ha bocciato; stessa forma del caso "gate non passati" |
| `lastRefusal` in `workflows.ts` | legge l'ultimo arbitrato qualunque sia la decisione, così la riparazione riceve i finding del revisore; i finding dell'arbitro contano solo se ha rifiutato |
| `arbiterPrompt` in `cycle.js` | riceve le due revisioni e dichiara la regola; lo script le passa da quelle appena inviate, o le legge dal plane su un ciclo ripreso, tramite un campo `reviews` aggiunto a `evidence` |

Il test che asseriva il `throw` è riscritto sul comportamento nuovo e verifica anche la cronologia e
`lastRefusal`. Suite, banco di dispatch e ciclo end to end verdi.

**Chiuso: la prova sul workflow reale.** L'albero corretto, caricato con `--plugin-dir` sulla stessa
WSL con il plugin installato disabilitato, ha ripreso il workflow fermo in `arbitration`. In una
sola sessione, diciassette minuti, 3,76 dollari:

| Evento | Cosa |
| --- | --- |
| 152 `arbitration.rejected` | l'arbitro, vedendo le revisioni e conoscendo la regola, ha rifiutato al primo dispatch |
| 153 `control.repair` | riparazione verso l'esecuzione |
| 154–156 | l'esecutore ha corretto il tie-break e aggiunto tre test; nuovo candidato, verifica passata |
| 157–158 | due revisioni indipendenti, entrambe approvate |
| 159 `arbitration.approved` | seconda arbitrazione |
| 160 `delivery.completed` | commit `1756417`, "on 7 recorded gates", albero pulito, cinque test verdi |

Stato finale: `route full · state completed · tasks 1/1 · reviews 4 · arbitrations 2 · repair 1/5 ·
delivered`. La rete di sicurezza nel plane, cioè registrare e instradare un'approvazione contro una
bocciatura, non è stata nemmeno esercitata: il prompt è bastato. Resta come garanzia per l'arbitro
che sbaglia comunque.

Il commit dice sette gate, dove il ciclo di Windows sulla 1.0.18 ne aveva dichiarati zero: A10
confermata sul prodotto reale su una seconda piattaforma.

## Blocco B — distribuzione

### B1. Il sito contraddice la licenza — PARZIALE 2026-09-07

runcycle.dev scrive "Open source · FSL-1.1-MIT". Il README dice correttamente che FSL non è open
source approvata OSI durante i primi due anni. Una delle due frasi è sbagliata, ed è quella sul sito.

### B2. La catena di rilascio non è protetta — CHIUSO 2026-09-07

| Controllo | Stato |
| --- | --- |
| Branch protection su `main` | assente |
| Ruleset | nessuno |
| Firma dei tag (`git verify-tag`) | nessuna firma |
| Dependabot security updates | disattivato |
| Secret scanning e push protection | attivi |

Un prodotto che vende integrità verificabile deve applicarla alla propria distribuzione.

**CHIUSO 2026-09-07, e la riproducibilità era falsa.**

Il 2026-09-06 avevo scritto che l'archivio era riproducibile fra piattaforme, perché il digest della
1.0.19 costruito in WSL coincideva con quello costruito su Windows. Era vero del confronto e falso
della proprietà: le due macchine stavano nello stesso fuso orario. L'attestazione aggiunta nella
1.0.21 lo ha scoperto alla sua prima esecuzione, che è esattamente ciò per cui esiste.

| Cosa | Esito |
| --- | --- |
| Ruleset su `main` | `deletion` e `non_fast_forward` bloccate |
| Ruleset sui tag `cycle--v*` | `deletion`, `non_fast_forward` e `update` bloccate: un tag pubblicato non si muove |
| Avvisi di vulnerabilità e Dependabot | attivi |
| Attestazione di provenienza | in CI sui soli tag, con confronto contro il digest fissato dal marketplace |
| Descrizione del repository | non dice più "open source" |

**Il difetto che l'attestazione ha trovato.** La CI ha impacchettato la 1.0.21 dallo stesso commit e
ha prodotto un digest diverso da quello fissato. Tutti e 119 i file erano identici byte per byte e
nello stesso ordine: la differenza era un solo campo in ogni intestazione locale, il timestamp
MS-DOS, letto da un istante fisso con i getter in ora locale. Una macchina a UTC+1 scriveva 01:00
dove un runner UTC scriveva 00:00. E quell'istante fisso era l'epoca Unix, dieci anni sotto il 1980
da cui MS-DOS conta, quindi ogni archivio mai pubblicato da questo progetto si datava 2098 per
wraparound.

Corretto nella 1.0.22: lettura in UTC, istante all'epoca del formato. Tre ambienti indipendenti
producono ora lo stesso digest dallo stesso commit: Windows, WSL e il runner GitHub, che è in UTC e
lo riproduce dopo la correzione e non prima.

**Perché l'attestazione e non GPG.** Una firma lega l'artefatto a una chiave da custodire e ruotare,
e chi verifica deve fidarsi di quella chiave. L'attestazione lega l'artefatto al workflow, al commit
e alla run che lo hanno prodotto, e `gh attestation verify` la controlla dall'esterno senza fidarsi
di nessuno. Verificata sul rilascio scaricato: nomina il commit `23605fd`, il workflow `ci.yml` e il
tag `refs/tags/cycle--v1.0.22`. E poiché l'archivio è davvero riproducibile, non serve nemmeno
credere all'attestazione: si ricostruisce e si confronta.

**Il tag 1.0.21 esiste senza rilascio**, perché il suo archivio non era riproducibile e non è stato
pubblicato. Il ruleset appena creato impedisce di cancellarlo, il che è il comportamento corretto e
la prima volta che una protezione di questa sessione ha vincolato me.

### B3. La guida multi-provider si dichiara un segnaposto — CHIUSO 2026-09-07

`docs/multi-provider.md` lo scrive nella seconda riga, ed è linkata dal README. Va scritta o tolta
dal README.

### B4. La documentazione di stato è disallineata — CHIUSO 2026-09-07

`SPECIFICATION.md` §20 dice che la pubblicazione è la fase successiva e che nulla viene pubblicato
prima della fase quattordici verde. Il repository è pubblico da diciotto release. `CERTIFICATION.md`
dichiara la riga 13.6 aperta fino alla fase quindici, mentre `certification-results.json` la registra
passata sulla 1.0.0.

---

## Blocco C — qualità, non blocca — CHIUSO: C1-C7 il 2026-09-07 (1.0.23), C8 il 2026-09-08 (1.0.24)

### C1. Opzione morta — CHIUSO 2026-09-07

`src/config.ts` leggeva `CLAUDE_PLUGIN_OPTION_OPERATOR_EFFORT`, che né `plugin.json` né `.mcp.json`
dichiaravano. La manopola esisteva quindi in un solo posto: nessuno raggiungibile da un utente.

L'operatore fa una chiamata deterministica al piano di controllo e ne riporta il risultato esatto:
non ha sforzo da spendere, quindi la lettura è stata tolta invece che la dichiarazione aggiunta.
`OPERATOR_EFFORT` ora compare fra le opzioni sconosciute come qualunque altro nome che questa build
non onora, ed è il doctor a dirlo.

Il test in `config.test.ts` copriva già due direzioni — ogni opzione dichiarata arriva al server, e
ogni variabile che il server riceve viene letta. Mancava la terza, che è quella che aveva lasciato
passare il difetto per quattro rilasci: un nome che il codice onora ma che nessuno dichiara.

### C2. Lo store cresce senza potatura — CHIUSO 2026-09-07

`limits` risponde a `usage` e `prune`. `usage` dice quanti byte di candidati sono trattenuti, quanti
se ne possono restituire e su quanti workflow, candidati e voci di cronologia poggiano quei numeri.
`prune` li restituisce, e senza `confirm: true` si limita a dire quanto libererebbe.

La politica è una sola riga, ed è la ragione per cui è sicura: **vanno via i byte, mai i record**.
La riga di `candidate_files` resta con il suo digest, quindi cosa conteneva un candidato resta
dimostrabile dopo che i byte non ci sono più, la catena non viene toccata e nessuno può usare la
potatura per rimuovere prove. Solo i candidati di workflow terminati, dove quei byte sono nel
repository perché sono stati consegnati, oppure deliberatamente no perché sono stati annullati. Un
workflow in corso tiene i suoi byte qualunque cosa venga chiesta.

Riga 10.8 della matrice, `tests/store-retention.test.ts`.

### C3. La suite dura otto minuti — CHIUSO 2026-09-07

Rimisurata prima di toccarla, e su Windows non era più vera: 41 secondi. La misura originale però
era su WSL, e lì il difetto c'era ancora, per una ragione che Windows nascondeva. `npm`, `pnpm` e
`yarn` su Windows si risolvono come shim e `probeVersion` esce senza eseguirli; su Linux sono
eseguibili veri. Quattro sonde da quattro secondi in serie, più git, per ogni chiamata a `diagnose`,
moltiplicate per ogni test che la chiama.

Le sonde ora partono in un giro solo. Su Windows il file di diagnostica passa da 10,7 a 5,7 secondi;
su Linux il guadagno è quello che C3 descriveva. Non è una stub del banco, è il costo di `doctor`
che scende per chiunque.

Suite completa oggi: 493 test, 48 secondi.

### C4. `schema-check.mjs` non ha asserzioni — CHIUSO 2026-09-07

Stampava lo schema e usciva zero qualunque cosa trovasse, mentre `certify.mjs` lo contava fra i
banchi passati: il problema di A1, in una suite che non sapeva fallire.

Ora dimostra le tre regole di immutabilità provando a violarle. Una voce di cronologia registrata
che non si può riscrivere né cancellare, una richiesta originale e un obiettivo che non si possono
modificare mentre i campi accanto a loro sì. Ventuno tabelle, l'indice full-text e undici indici
verificati per presenza; le quattro regole verificate per comportamento.

### C5. Una sola esecuzione verde della CI — CHIUSO 2026-09-06

Cinque esecuzioni verdi consecutive: il tag 1.0.17, `main` e il tag per la 1.0.18, `main` e il tag
per la 1.0.19. Su Windows, Ubuntu e il job del floor, ogni volta.

### C6. L'indice ripiega in silenzio su una camminata del filesystem quando git rifiuta — CHIUSO 2026-09-07

Il ripiego è stato tolto. `discover` restituisce ora i file oppure un rifiuto con la ragione di git,
e `indexProject` esce subito riportando `refused`.

La parte che conta più della rimozione: **non tocca l'indice già costruito**. Trattare "git non
risponde" come "il repository è vuoto" avrebbe fatto scattare il ciclo di rimozione e cancellato
ogni file indicizzato — il grafo distrutto da un git transitorio, che è esattamente il modo in cui
questa correzione poteva peggiorare le cose. `/cycle:index` riporta la ragione e dice che il grafo
interrogabile è quello di prima.

I banchi hanno dovuto adeguarsi, ed è la prova che il ripiego serviva a loro e non agli utenti: le
fixture di `intel-index.test.ts` non erano repository git, e passavano solo perché la camminata le
raccoglieva. Ora fanno `git init`, che è la condizione in cui Cycle lavora davvero.

Riga 8.8 della matrice.

### C7. Le righe manuali si riaprono a ogni rilascio: automatizzare quelle che si possono — CHIUSO 2026-09-07

`tests-debug/marketplace.mjs` rivendica 1.3, 1.4 e 1.5, e la matrice le segna A su entrambe le
piattaforme. Installa questa versione dal proprio manifesto di marketplace dentro una
`CLAUDE_CONFIG_DIR` temporanea e verifica: la versione installata è quella che l'albero dichiara,
l'archivio è stato scompattato dentro la configurazione isolata e non altrove, il plugin è abilitato,
le opzioni passate all'installazione sono persistite, e l'inventario dei componenti che l'host
risolve coincide **nome per nome** con quello che l'albero contiene — letto dall'albero, non scritto
nel banco, perché un conteggio in due posti è un conteggio che diverge.

Fallisce e non salta senza CLI o senza rete, e fallisce prima di un rilascio dicendo che l'archivio
di questa versione non è ancora pubblicato: il manifesto punta a una release e a un digest.

`tests-debug/full-cycle.mjs` fa lo stesso per la 13.6, che resta manuale perché spende denaro vero.
Fixture, `/cycle:run`, `/cycle:resume` finché non si stabilizza, poi lettura dello store, della
catena e del commit. Il driver era stato riscritto a mano quattro volte in una sessione, ogni volta
un po' diverso; ora è uno solo, con asserzioni e uscita non zero.

**Cosa hanno trovato i banchi alla loro prima esecuzione vera.** Vale la pena registrarlo, perché è
la ragione per cui un banco con asserzioni non è la stessa cosa di un driver scritto a mano.

| Banco | Trovato | Dove stava il difetto |
| --- | --- | --- |
| `marketplace.mjs` | il percorso del plugin va passato assoluto, la CLI rifiuta un relativo | nel banco |
| `full-cycle.mjs` | leggeva l'ultima riga di stdout invece della riga con l'id della chiamata, quindi un workflow completato veniva letto come `null` e faceva partire un resume da cinque dollari che non serviva | nel banco |
| `full-cycle.mjs` | tre asserzioni di conteggio costruite in un template literal dove un backslash sopravviveva a un livello di escaping e non al successivo: il pattern era `(d+)` e non corrispondeva a nulla, su un ciclo andato perfettamente | nel banco |
| `full-cycle.mjs` | asseriva che un'opzione del plugin fosse arrivata al piano, leggendola da un processo che il banco stesso avvia: solo l'host sostituisce quelle variabili | nel banco |
| `full-cycle.mjs` | due resume non bastano a un ciclo conteso — revisori divisi, arbitro che rifiuta, riparazione — e fermarsi una sessione prima riporta una consegna bloccata dove c'era solo un budget esaurito | nel banco |
| `index-scale.mjs` | generava il corpus come directory temporanea qualunque, mai un repository git, e passava solo perché l'indexer camminava il filesystem. Tolto il ripiego con C6, ha riportato `files indexed 0` e `delta is bounded false` | **nel banco, ma è una conseguenza vera di C6** |
| `index-scale.mjs` | rimuovere mezzo milione di file esaurisce gli handle di Windows, e l'eccezione seppelliva il risultato che l'esecuzione esisteva per riportare | nel banco |
| `reach-bench.mjs` | indicizzare l'albero del padre del commit rendeva ogni file *aggiunto* irrisolto per costruzione, una proprietà della misura e non del sensore | nel banco |

Sette difetti su otto stavano nei banchi, non nel prodotto. È il risultato che ci si aspetta da
codice scritto una volta e mai eseguito con asserzioni, ed è esattamente ciò che A1 diceva del
banco principale. L'ottavo, il corpus senza git, è l'unico che dice qualcosa sul prodotto: C6 ha
cambiato il significato di "indicizza questa directory" per una directory che non è un repository,
e il banco lo ha scoperto perché era l'unico posto in cui quel caso veniva ancora esercitato.

**Fatto quando** — verificato: un bump di versione riapre al massimo quattro righe manuali per
piattaforma (1.6, 1.7, 2.2, 4.7), e nessuna delle quattro si chiude con un comando perché tutte e
quattro richiedono una persona davanti all'applicazione.

### C8. Sotto una allowlist esplicita, `/cycle:run` fallisce in silenzio e il lavoro viene fatto a mano — CHIUSO 2026-09-08 (1.0.24)

Trovato certificando la riga 13.6 su WSL, dove il piano di controllo, i ruoli e gli strumenti di
scrittura erano concessi e il tool `Workflow` dell'host no.

`/cycle:run` è un workflow dinamico. Senza il tool `Workflow` il modello non può avviarlo — e non
falliva. Faceva il lavoro a mano: modificava i file, rispondeva che aveva finito, e lasciava dietro
di sé un albero sporco, nessun workflow nello store e una sessione costata centesimi. Dall'esterno
era indistinguibile da una consegna bloccata.

**Quanto vuole essere documentato.** Dopo averlo trovato la prima volta, questa stessa sessione ci è
ricascata altre due volte nei propri script: una volta generando uno script attraverso una shell che
espandeva le variabili a vuoto e lasciava `--allowedTools ,`, un'altra dimenticando `Workflow` in una
lista scritta a mano. Tre volte in un giorno, sempre con lo stesso sintomo illeggibile.

**Cosa fa ora.** La skill `run` si ferma quando non può avviare il workflow, dice quale delle due
cause è — tool mancante oppure workflow dinamici disattivati — e dice cosa la risolve, invece di
ripiegare sul farlo a mano. È lo stesso ripiego muto tolto dall'indexer in C6, un livello più in
alto: un "fatto" falso senza gate, senza revisori e senza record è esattamente ciò che questo
prodotto esiste per rifiutare, e stava arrivando da una lista di permessi invece che da un difetto.

Il README lo dice sotto Requirements, perché è più facile sbagliarlo proprio dove conta di più:
nell'automazione, e sotto `root`, dove la CLI rifiuta la modalità permissiva e una lista esplicita è
l'unica opzione.

---

## Blocco D — modello di impatto — D1, D2, D3, D4 CHIUSI 2026-09-07 (1.0.23); D5 rinviato per disegno

Origine: diligence tecnica di un investitore, 2026-09-06.

### Cosa era vero prima della 1.0.23, verificato sul codice

| Affermazione | Riscontro |
| --- | --- |
| Il routing non usa la reachability | `route()` e `required.ts` non importavano nulla dal grafo |
| Esiste una query di impatto | `impactOf()` in `src/intel/query.ts`: BFS sugli archi entranti, profondità 1–4, nessun tetto sul fan-in |
| Il grafo non vede la configurazione | `extract.ts` produce solo `imports` e `calls` |
| I file ignorati sono invisibili | `changedFiles()` usa `git status`, che esclude `.gitignore` |

Le due dimensioni che l'investitore chiedeva di separare esistevano già: `route()` sceglie gli
agenti, `requiredMissingGates()` sceglie le prove obbligatorie, e sono indipendenti. Mancava che la
seconda ricevesse la reach oltre ai percorsi toccati. Ora la riceve.

### D1. La reach come sensore della superficie di evidenza — CHIUSO 2026-09-07

`verify()` chiama `reachOf` sui percorsi cambiati e passa a `requiredMissingGates` l'unione di
toccati e raggiunti. Le regex esistenti si applicano quindi anche a ciò che la modifica raggiunge:
una riga in un caricatore di configurazione importato da `src/auth/session.ts` fa scattare
`security:executed-proof` senza che nessuno abbia toccato `auth`.

Promote-only per costruzione, e c'è un test che lo dice esplicitamente: aggiungere percorsi
all'insieme può solo aggiungere gate, e non ha modo di toglierne. Il routing resta deterministico e
basato su richiesta e percorsi; la reach vive nel livello delle prove, dove può ampliare senza
rendere tutto `full`.

Righe 5.22 della matrice, `evidence-required.test.ts`.

### D2. La reach sconosciuta è una prova registrata, non una foglia — CHIUSO 2026-09-07

`impact:unresolved` è evidenza registrata con la causa e il comando che la risolve. Avviso sotto
`standard` e `advisory`, obbligatorio sotto `strict`: rispetta la manopola di rigore che esiste già
invece di inventarne una seconda. Un progetto mai indicizzato non viene bloccato al primo giro, ma
la mancanza è nel record e i revisori la leggono.

"Risolta" è dichiarata strettamente: il grafo deve esistere e ogni file cambiato che il grafo
modella deve essere nell'indice. Una distinzione che è costata un ramo in più ed è giusta: un file
in un linguaggio senza grammatica è *fuori dal modello*, non una copertura mancante, altrimenti una
modifica al README porterebbe la stessa incertezza di sorgente non indicizzato e il numero che conta
annegherebbe in quello che non conta.

Righe 5.23, `evidence-reach.test.ts` e `evidence-engine.test.ts`.

### D3. Il fan-in alto amplia la prova, non il workflow — CHIUSO 2026-09-07

Oltre la soglia — il massimo fra duecento file e un decimo dell'indice — l'insieme raggiunto smette
di essere informazione. `impact:high-fan-in` viene registrato come finding non obbligatorio con i
simboli hub e il numero di consumatori, e la superficie di evidenza non viene ampliata. Un logger
condiviso non trasforma ogni modifica in un ciclo massimo, e i revisori sanno che lo tocca.

Riga 5.24.

### D4. Misura su un repository non scritto da noi — BANCO PRONTO, in attesa di etichettatori

`tests-debug/reach-bench.mjs`, con i tre strati del protocollo e la correzione del 2026-09-08.

1. **La macchina propone, e l'insieme viene congelato.** `freeze` costruisce per ogni commit i
   consumatori candidati — la reach calcolata più i vicini che la troncatura da hub ha escluso — e
   li congela con un digest prima che qualcuno li guardi. Il digest lega un file di etichette
   all'insieme che ha visto: etichette su un insieme rigenerato sono un altro esperimento, e
   `score` lo rifiuta.
2. **Etichettatori indipendenti** riempiono `affected`, `not affected`, `can't tell` senza vedere le
   risposte degli altri. `template` genera il foglio.
3. **I disaccordi si tengono.** Non vengono mediati, e un pareggio non viene risolto per ordine di
   lista: un candidato conteso è escluso dalle due misure che richiedono un riferimento e resta
   nell'elenco dei disaccordi.

#### La correzione sul campionamento, 2026-09-08

Un revisore esterno ha smontato la strategia dichiarata, e aveva ragione. La prima stesura ne aveva
una sola: partire larghi, poi lasciare che il disaccordo guidi il giro successivo. Ma il
campionamento guidato dal disaccordo costruisce **apposta** un corpus di casi difficili, quindi una
quota misurata su di esso descrive la difficoltà che è stata selezionata e non le modifiche che
Cycle incontra davvero. Migliorare la tassonomia e stimare quanto spesso la tassonomia va in crisi
sono due domande diverse, e un corpus solo non può rispondere a entrambe.

Ora ci sono **due insiemi, e non vengono mai fusi in un numero solo**:

| `--purpose` | Come si estrae | A cosa serve |
| --- | --- | --- |
| `distribution` | a caso, senza riguardo a quanto sembrano difficili | l'unico da cui si può citare una quota di unknown; resta **fuori dalla messa a punto**, non solo fuori dal report finale |
| `taxonomy` | dai candidati con l'accordo più basso di un giro precedente | affina la nozione di "affected"; `score` **rifiuta** di quotare una quota di unknown da qui |

Il rifiuto è un rifiuto e non un avvertimento: un numero con un cartello accanto viene ripetuto
senza il cartello, e questa è la cifra che ha più probabilità di finire in una frase detta a
qualcuno che non era presente.

`freeze` pretende il proposito e non ha un valore predefinito, perché quale dei due sia un insieme
non è recuperabile dopo. Gli insiemi congelati prima di questa correzione non sono più valutabili, e
`score` li rifiuta invece di indovinare: verificato sul set di chalk congelato il 7 settembre.

**Nessuna soglia vive qui.** Nessuna quota di unknown è stata misurata, e una cifra scelta perché
suona ragionevole diventerebbe una premessa nel momento in cui viene scritta: se una quota sia
sostenibile dipende dalla verifica che innesca e dal costo di risolvere ciascun unknown, e questo
banco non osserva né l'una né l'altro.

#### La seconda correzione: chi propone i candidati, e chi etichetta — 2026-09-08

Lo stesso revisore ha portato l'obiezione più profonda finora, ed è strutturale.

**Il primo pezzo.** L'insieme dei candidati era proposto dalla macchina, e la macchina era Cycle. Un
etichettatore poteva rispondere *affected*, *not affected* o *can't tell* soltanto su consumatori
che Cycle aveva già tirato fuori. La reach che Cycle non propone **non aveva una riga sul foglio**,
quindi le omissioni — la cosa che più vogliamo trovare — non potevano entrare nei dati. Il
riferimento ereditava il punto cieco della cosa che doveva misurare.

**Il secondo pezzo.** Se chi ha scritto la tassonomia è anche uno dei due etichettatori, l'accordo
smette di essere evidenza: un ingegnere che lavora sulla tua rubrica converge con te perché l'ha
ereditata. L'accordo dimostra che una regola è applicata in modo coerente, mai che quella regola
descriva il software.

**Cosa fa ora il banco.**

| Correzione | Come è implementata |
| --- | --- |
| Un secondo generatore che non è Cycle | `independentCandidates()` costruisce una lista dal testo del repository: file che nominano un file cambiato per percorso o nome, e file che nominano un simbolo esportato che la modifica tocca. Non guarda mai il grafo, e gira **prima** che la reach venga consultata |
| Lista combinata, etichettatori ciechi | l'unione dei due generatori, ordinata per digest del percorso e non alfabeticamente, così né le abitudini di un generatore né l'ordine in cui sono girati trapelano dalla posizione. La provenienza resta nel file congelato e **non compare mai sul foglio** |
| La riga bianca | ogni foglio ha una sezione `additions` dove un etichettatore scrive un consumatore che nessuna riga offre. È l'unico posto in cui una omissione vera può emergere |
| Le aggiunte non diventano verità | `score` le riporta come *omissioni da entrambe le liste* e dice esplicitamente che non sono risultati: servono un secondo giro di etichettatura indipendente. Assorbirle nell'insieme ricostruirebbe la circolarità con un generatore umano al posto di uno meccanico |
| Il pannello dichiara dove si trova | ogni foglio porta `hasSeenCycleTaxonomy`, `knowsThisRepository`, `preparedThisRun`. `score` **rifiuta** un pannello in cui tutti hanno visto la tassonomia, rifiuta di valutare chi ha preparato la corsa, e rifiuta un etichettatore che non ha dichiarato |
| L'accordo non è correttezza | la misura si chiama ora *per-candidate consistency* e stampa accanto a sé che dice come è stata applicata una nozione di "affected", non che quella nozione descriva il software |
| Gli errori sono divisi per generatore | la misura *confidently wrong* dice quanti riguardano candidati proposti da Cycle e quanti candidati che **solo il generatore indipendente** ha trovato. La seconda classe è quella che prima non poteva esistere |

**Prima esecuzione con due generatori** (chalk, sei commit): il generatore indipendente ha proposto
fra i **sei e i quattordici candidati per campione che Cycle non aveva proposto**. Su un campione,
quattordici su sedici. Sotto il protocollo precedente quelle righe non sarebbero esistite, e
qualunque omissione fra loro sarebbe stata introvabile per costruzione.

Va detto con precisione cosa questo significa e cosa no: sono **candidati**, non omissioni
dimostrate. Il generatore indipendente è volutamente grezzo, propone troppo, e sbaglia anche lui. Se
qualcuno di quei percorsi sia davvero affetto è ciò che gli etichettatori decidono — il punto è che
adesso possono decidere.

**Cosa non è stato fatto.** Il revisore proponeva anche tracce di esecuzione, copertura dei test e
storia di proprietà come sorgenti indipendenti. È implementata solo la ricerca su sorgente e
configurazione. Le altre tre sono più informative e più costose, e vanno aggiunte quando il pilota
dirà se servono — non prima, e non per completezza.

E resta vero, dopo tutto questo, che il risultato **non sarà verità di riferimento completa**: un
generatore indipendente omette anche lui, e le tracce mostrano solo le esecuzioni osservate. Quello
che si ottiene è un modo per stabilire omissioni **fuori dalla vista di Cycle**, senza fingere di
aver stabilito ogni impatto possibile.

Ventotto asserzioni nel selftest, uscita zero.

#### La terza tornata di correzioni — 2026-09-08, sera

Sei osservazioni sul banco. Quattro erano difetti veri, due sono state accolte in parte e una è
stata deliberatamente non fatta.

**1. L'indipendenza va dimostrata anche sui dati in ingresso.** Vera, e il generatore aveva un buco:
leggeva solo l'albero *dopo* la modifica, quindi un simbolo cancellato o rinominato non contribuiva
alcun termine di ricerca — e i suoi consumatori sono proprio quelli che più probabilmente si
rompono. Ora legge entrambe le revisioni attraverso `git show`, così un percorso cancellato ha
ancora una versione da cui estrarre nomi. L'indipendenza del meccanismo è ora asserita e non
dichiarata: la funzione riceve un comando git, una lista di file e una revisione, e non c'è database,
grafo o lista di simboli prodotta da Cycle fra i suoi argomenti.

**2. Il caso delle configurazioni.** Vera, ed era il buco più grave, perché è il caso da cui è nata
tutta la discussione. Il generatore cercava percorsi e simboli esportati: un consumatore che sceglie
un provider leggendo `MODEL_PROVIDER` non nomina mai il file che ne definisce il valore, quindi non
poteva essere proposto da nessuno dei due generatori. Ora i termini di ricerca includono le chiavi e
i letterali che il **diff** tocca.

Verificato con un caso costruito apposta, dentro il selftest: un repository di quattro file, un
commit che cambia un valore predefinito e cancella un helper. Il consumatore raggiunto solo dalla
chiave e quello che usava il simbolo cancellato **vengono entrambi proposti**. Se un giorno non lo
saranno più, il selftest fallisce invece di passare perché ha trovato altri candidati.

**3. Separare l'esclusione del preparatore da quella degli autori.** Vera, ed era una lacuna netta:
le due regole precedenti non escludevano l'autore di Cycle o della tassonomia — bastava che
qualcun altro preparasse la corsa. La dichiarazione ha ora quattro campi distinti — `authoredCycle`,
`authoredTaxonomy`, `hasSeenCycleTaxonomy`, `preparedThisRun` — e `score` rifiuta un pannello che
contenga un autore, anche se non ha preparato niente.

**4. Il foglio cieco per schema, non per ricerca di parole vietate.** Vera. Una ricerca di parole
proibite passa nel momento in cui la provenienza arriva sotto un nome che nessuno aveva pensato di
vietare. Ora c'è una lista esplicita dei campi ammessi, il controllo è una funzione a sé
(`sheetLeaks`) ed è verificata con **metadati-esca**: un campo che nessuno ha autorizzato, comunque
si chiami, e un valore attaccato alla riga del candidato.

**5. Non affidare alla sola riga bianca ciò che entrambi i generatori perdono.** Accolta come
principio, non ancora implementata. Un audit su elementi fuori dall'unione, estratti da un perimetro
dichiarato, è la cosa giusta e va progettata insieme al perimetro: dichiarare "i moduli del
repository" senza dire quali esclusioni valgono produrrebbe un denominatore arbitrario, che è
esattamente il difetto contro cui l'osservazione mette in guardia. **Prossimo passo, non fatto.**

**6. Congelare artefatti e denominatori.** Fatta a metà. Il file congelato porta ora un manifesto —
digest del banco, versione di Cycle, versione di Node, comando eseguito, commit inclusi, HEAD del
repository — quindi un insieme può essere rigenerato e confrontato. Restano da separare nel report
le quantità che l'osservazione elenca, in particolare **`can't tell` umano e `unknown` di Cycle, che
non devono mai diventare lo stesso contatore**.

**Cosa non è stato fatto, e perché.** Tracce di esecuzione, copertura e storia di proprietà restano
fuori. Erano proposte come *fonti alternative*, non come tre pipeline obbligatorie, e costruirle
adesso allargherebbe il banco prima di sapere se il generatore attuale basta. La priorità è
riprodurre, verificare i confini e raccogliere le prime etichette davvero indipendenti.

**E la cosa da non dire.** Quello che è cambiato è **il modo di valutare Cycle**, non l'accuratezza
di Cycle. I sei-quattordici candidati in più per campione dicono che il foglio ora espone righe che
prima escludeva. Se quei consumatori siano davvero affetti è esattamente ciò che le etichette
indipendenti devono ancora dire. Ventiquattro asserzioni nel selftest non sostituiscono una sola
etichetta.

#### La quarta tornata — 2026-09-08, notte: due difetti trovati sondando, non leggendo

Il revisore ha sospettato due cose e ha avuto ragione su entrambe. Sono state verificate eseguendole
su un repository costruito apposta, prima di scrivere qualunque correzione.

**Il primo: la ricerca guardava il working tree, non la revisione congelata.** `git grep` senza un
argomento di revisione cerca in ciò che è estratto sul disco. Nel flusso di `freeze` questo era
corretto per caso — il worktree viene creato *al commit* — e sbagliato per chiunque altro. Il
sondaggio l'ha colto proponendo `src/later.js`, un file aggiunto da un commit **successivo** alla
coppia congelata: termini letti correttamente dal passato, cercati nel presente. Ora la ricerca
nomina la revisione.

**Il secondo: una chiave su una riga non modificata non entrava fra i termini.** Il caso è quello
che il revisore ha descritto: `DEFAULT_ROUTE = "alpha"` diventa `"beta"` mentre
`KEY = "ROUTING_TABLE"` due righe sopra resta intatta. Leggendo solo le righe `+` e `-` il termine
che dà senso alla modifica non compariva mai, e il generatore proponeva **zero candidati**. Ora il
diff viene letto con contesto.

I due sondaggi sono diventati asserzioni: un commit successivo non deve cambiare il risultato della
stessa coppia, e la chiave su riga invariata deve essere trovata.

**Il terzo punto accolto: un foglio senza etichette non deve sembrare un buon risultato.** La
copertura ora viene stampata *prima* delle misure, e con zero righe etichettate le misure vengono
trattenute del tutto — perché "0 su 0 confidently wrong" si legge come una buona notizia, e chi si
ferma al primo numero prenderebbe un foglio mai compilato per un sistema che ha indovinato tutto.
Una riga vuota non è più un errore che invalida il foglio: è l'assenza di un giudizio, contata nella
copertura. Un foglio parziale si valuta e dichiara quanto copre.

Le unità sono dichiarate accanto ai numeri, e con esse la distinzione che il revisore mette per
prima: **l'`unknown` di Cycle è per modifica, il `can't tell` di una persona è per riga. Non sono lo
stesso contatore.**

**Il quarto: la domanda mancava.** Il foglio consegnava percorsi e tre parole, e lasciava a ciascuno
decidere in privato cosa volesse dire "affected". Ora porta la domanda per esteso — comportamentale
e non strutturale — con il perimetro dichiarato: consumatori dentro il repository, configurazioni
che il repository documenta, e il fatto che importare qualcosa che la modifica tocca non è di per sé
una risposta. Due persone che rispondono a domande diverse non concordano né discordano su niente.

Ventotto asserzioni nel selftest, uscita zero.

**Cosa resta aperto di questa tornata.** L'audit fuori dall'unione e il legame verificabile fra
foglio, revisioni e insieme congelato oltre il digest già controllato. E il rilievo che il revisore
fa sul rinvio è giusto: il pilota potrà dire se il generatore attuale produce candidati utili e a
quale costo, **non** che non esistano omissioni fuori da entrambe le liste. Il report deve quindi
restare circoscritto a "omissioni confermate nel riferimento parziale", mai a "completezza della
reach dimostrata".

**E i numeri su chalk vanno rifatti.** Quelli citati finora — sei-quattordici candidati in più per
campione — appartengono alla versione del generatore precedente a queste due correzioni. Restano
associati a quella versione e non vanno presentati come risultati di questa.

#### Cosa ha trovato

**Prima esecuzione su codice non nostro** (chalk, dodici commit): la reach di un file **cancellato**
è ignota per costruzione, perché il grafo da cui andrebbe letta non lo contiene più. Cycle dice "non
lo so" invece di dire che non è affetto niente.

Ha anche corretto due artefatti del banco stesso: indicizzare l'albero del padre del commit rendeva
ogni file *aggiunto* irrisolto per costruzione; e il selftest usciva non-zero con ogni asserzione
verde, perché `score` chiamava `close()` e terminava il processo prima dell'ultima verifica. Un
banco che non poteva passare, accanto a uno che non sapeva fallire: è lo stesso errore, ed è la
lezione di A1 vista dall'altro lato.

**Fatto quando** — insiemi congelati per un repository esterno con il proposito dichiarato, etichette
indipendenti da più persone, disaccordi conservati, cinque misure calcolate, la quota di unknown citata solo
da un insieme casuale, e i candidati proposti da due generatori indipendenti fra loro. Manca solo ciò che non può essere fatto da qui: **gli etichettatori umani**, con almeno uno che
non abbia visto la tassonomia di Cycle e nessuno che abbia preparato la corsa — condizioni che il
banco ora verifica invece di raccomandare.

### D5. Archi di configurazione — RINVIATO per la ragione del piano stesso

Estendere l'estrattore con un riferimento `reads-config` per `process.env.X`, `os.environ[...]`,
`os.Getenv`, `std::env::var`, `ENV[...]`, con la chiave come nodo.

Il piano dice "dopo D4, non prima: è D4 a dire quale quota dello sconosciuto ha forma di
configurazione, e quindi se questo lavoro vale il suo costo". D4 esiste da oggi e non ha ancora
girato con etichettatori umani, quindi quel numero non c'è. Farlo adesso sarebbe costruire senza la
misura che il piano ha messo apposta prima, e chiuderlo per completezza sarebbe peggio che lasciarlo
aperto onestamente.

Si sblocca quando il banco ha prodotto la prima quota di *unknown* etichettata.

---

## Sequenza — eseguita

1. **A1 e A2 insieme.** Il banco corretto è ciò che ha rivelato se il resto funzionava: fino ad
   allora ogni altra prova poggiava su uno strumento che non sapeva fallire. Eseguito.
2. **A3, A5, A6.** Tre correzioni piccole nello stesso giro di test. Eseguito.
3. **A7 e A8.** Testo e un'impostazione del repository. Eseguito.
4. **A4, la ricertificazione.** Contro il codice già corretto. Eseguito, e riaperto quattro volte
   dai rilasci che le correzioni hanno richiesto — il costo che C7 ha poi eliminato per tre righe.
5. **Blocco B**, in parallelo perché non tocca codice. Chiuso salvo B1, che non è raggiungibile da
   qui. B2 ha trovato la non riproducibilità dell'archivio alla sua prima esecuzione.
6. **Blocco C e D insieme, prima della certificazione finale.** Deliberato: C6 riscrive l'indexer e
   D1–D3 toccano i gate, quindi ogni riga certificata prima di loro sarebbe stata buttata dal
   rilascio che avrebbero comunque forzato. Un rilascio solo, la 1.0.23, poi la matrice intera.

Resta D5, rinviato dalla ragione che il piano stesso gli aveva dato: è D4 a dire se vale il costo, e
D4 non ha ancora girato con etichettatori umani.

## Stato al 2026-09-08, contro la 1.0.24 pubblicata

| Piattaforma | Passate | Non applicabili | Aperte |
| --- | --- | --- | --- |
| Windows | 129 | 6 | 1.6, 1.7, 2.2 |
| WSL | 127 | 8 | 1.6, 1.7, 2.2 |

Otto banchi automatici verdi su entrambe, incluse le due righe nuove 1.14 e 2.10.

Le righe manuali per costo — 3.5, 4.7, 8.7, 13.6 — sono chiuse su entrambe le piattaforme contro la
1.0.24, tutte eseguite da banchi con asserzioni. Restano aperte solo le tre che richiedono una
persona davanti all'applicazione in esecuzione.

### Due righe manuali in meno, per sempre

1.6 e 2.2 chiedevano ciascuna due cose, e solo una delle due aveva bisogno di occhi. La parte
verificabile è ora automatica, rivendicata da `marketplace.mjs`:

| Riga | Cosa verifica ora una macchina |
| --- | --- |
| 1.14 | la copia installata avvia il proprio server, che risponde, ed è quella scompattata e non l'albero sorgente; e ogni suo componente supera `validate --strict`, che è ciò che metterebbe una voce nella scheda errori |
| 2.10 | i valori configurati all'installazione sono ancora lì per un processo successivo, insieme all'abilitazione |

Restano manuali le due metà che nessun processo può fare: guardare la scheda errori, e vedere il
prompt comparire all'abilitazione.

La 4.7 non è più un'attestazione: `tests-debug/recovery.mjs` avvia un ciclo, uccide la sessione per
albero di processi a metà, e verifica che una sessione nuova si riattacchi allo stesso workflow con
la richiesta intatta e il record solo cresciuto. Quattordici asserzioni, meno di un dollaro.

### La 13.6 su Windows: due tentativi, e il primo vale quanto il secondo

Il primo è finito in stato `paused` dopo quattro sessioni e 25,25 dollari, con la ragione registrata
due volte: *"the recorded evidence could not be read"*. Non è un difetto — è il ramo che
`workflows/cycle.js` ha proprio per questo caso. Una lettura fallita non è un candidato senza
evidenza, e trattare le due come una cosa sola aveva già mandato un arbitro a giudicare a mani vuote,
approvare lavoro che un revisore aveva rifiutato, e vedersi rifiutare il verdetto perché non citava
requisiti.

Il secondo, senza cambiare nulla, ha consegnato: ventiquattro asserzioni, zero fallimenti, commit
`2cee887` su sette gate, tre sessioni, 17,12 dollari. Questo colloca il primo come un guasto
transitorio della chiamata all'operatore, e la pausa come ciò che ha impedito a quel transitorio di
diventare un'approvazione falsa. È la differenza fra un sistema che si ferma e uno che tira a
indovinare.

Vale la pena tenere i due numeri accanto. Stessa richiesta, stesso banco, stessa versione:

| | Sessioni | Costo | Esito |
| --- | --- | --- | --- |
| WSL | 1 | 1,98 $ | consegnata su otto gate |
| Windows | 3 | 17,12 $ | consegnata su sette gate |

Nove volte il costo per lo stesso lavoro, con lo stesso percorso — due revisioni e un'arbitrazione
in entrambi i casi. Le due installazioni hanno configurazioni di modelli diverse, ed è lì che
guardare: `/cycle:models` su entrambe le macchine.

## Definizione di finito

| Condizione | Stato |
| --- | --- |
| `certify.mjs` non stampa righe bloccanti, su Windows e su WSL, contro la versione pubblicata | aperta su tre righe, tutte e tre da fare davanti all'applicazione |
| `cycle-e2e.mjs` fallisce se il ciclo non consegna, e passa perché consegna davvero | vale dalla 1.0.19 |
| Il guard rifiuta sia `Task` sia `Agent`, con un test che copre entrambi per ogni ruolo | vale dalla 1.0.19 |
| Il README elenca ogni requisito necessario a far partire `/cycle:run` | vale dalla 1.0.24 |

Tre su quattro. La prima non dipende più da spesa o da tempo macchina: dipende da tre osservazioni
che nessun processo può fare.

## Cosa resta, e a chi tocca

**All'operatore**, su entrambe le piattaforme, tre righe:

- 1.6, la scheda errori di `/plugin`
- 1.7, `/reload-plugins` dopo una modifica a un componente
- 2.2, la richiesta dei valori all'abilitazione

**A chi pubblica il sito.** Il sito in produzione è fermo al 25 agosto. Non sono pubblicate: la
correzione sulla licenza del 7 settembre, e le cinque correzioni dell'8 — menu delle lingue,
bersagli di tocco, scaglionamento, tedesco, ordine dell'header.

**Versionamento: fatto il 2026-09-08.** `documentation/` e `tests-debug/` vivono ora dentro il
repository, quindi la matrice, gli ottantatré risultati registrati e i dieci banchi sono pubblici e
verificabili da chiunque. La spinta è venuta da un revisore esterno che ha controllato `main` e non
ha trovato nulla di ciò che gli era stato descritto: aveva ragione, e non era un suo limite.

L'archivio non è cambiato di un byte — si costruisce da una lista di inclusione in
`scripts/manifest.mjs`, quindi una directory che non è sulla lista non viene raccolta comunque
vicino alla radice si trovi. Digest identico prima e dopo lo spostamento, e nessun rilascio.

**A una verifica sui modelli.** Nove volte il costo fra WSL e Windows per lo stesso ciclo.

**A degli etichettatori umani.** D4 ha banco, protocollo e prima esecuzione su codice esterno; non
ha etichette. D5 resta chiuso per disegno finché non le ha.

## Il sito, 2026-09-08

Corretto in sorgente e ricostruito in locale; non pubblicato.

| Trovato | Stato |
| --- | --- |
| Il menu delle lingue usciva 80 px fuori schermo a 375 px, e la prima colonna era irraggiungibile | corretto: sotto i 620 px si ancora all'intestazione invece che al pulsante, verificato a 320 e 375 px e in urdu (RTL) |
| Quattro bersagli di tocco sotto i 24 px chiesti da WCAG 2.2 — i due crediti nel piè di pagina e i due link del banner cookie | corretti a 24 px con altezza, non con padding, per non muovere ciò che li circonda |
| I gruppi di card apparivano tutti insieme | scaglionati di 70 ms per posizione, con tetto a 420 ms, dentro il ramo che già si disattiva con `prefers-reduced-motion` |
| Nel tedesco avevo tradotto "source available" con *quelloffen*, che in tedesco significa proprio open source | corretto: "im Quellcode einsehbar" |
| L'ordine dell'header | riordinato in logo · tema · vista · lingua · menu, su richiesta |

L'ordine dell'header è stato cambiato nel DOM dei quattro template e non con `order` in CSS, così
l'ordine di tabulazione coincide con quello visivo: riordinare solo l'aspetto e lasciare il DOM
com'era è esattamente lo scostamento di cui parla la WCAG 2.4.3, e qui non costava niente evitarlo.
Verificato a 375 px: logo a 16, tema a 115, vista a 164, lingua a 213, menu a 321, e la sequenza di
tabulazione è la stessa.

**Cosa invece regge.** Settanta pagine: nessun link interno rotto, nessuna immagine senza `alt`,
nessun controllo senza nome accessibile, un solo `h1` per pagina, `lang` e `dir` corretti ovunque,
canonical e description presenti tranne sulle pagine 404 e 502, dove è giusto che manchino perché
sono `noindex`.

**Le animazioni.** Il livello c'è già ed è pensato: la pipeline dell'intestazione che si illumina in
sequenza, le parole rotanti, i reveal allo scroll, i contatori, il ticker. Rispetta
`prefers-reduced-motion`, ha un interruttore di accessibilità dedicato e si spegne del tutto nella
vista LLM. Per un prodotto che vende rigore, la sobrietà è una scelta e non una lacuna: l'unica cosa
che mancava era lo scaglionamento, ed è stata aggiunta.

## Le pagine legali

Non sono un avvocato e quanto segue non è un parere legale: è una lettura fattuale di cosa dicono e
di cosa non dicono.

**Cosa coprono, e lo fanno bene.** Titolare identificato con nome, indirizzo, partita IVA e PEC.
Basi giuridiche citate per articolo. Categorie di dati, assenza di profilazione e di analytics,
responsabile del trattamento, conservazione, diritti dell'interessato e reclamo al Garante. Banner
con accetta e rifiuta di pari evidenza, registrazione del consenso per dodici mesi. Legge italiana e
foro competente con la riserva per il consumatore. Limitazione di responsabilità con le esclusioni
inderogabili — dolo, colpa grave, danno alla persona. E la dichiarazione che la versione italiana è
quella vincolante, che è la cosa che tiene in piedi tutte le altre traduzioni.

**Quattro cose da guardare.**

1. **Le pagine proteggono il sito, non il software.** I termini dicono esplicitamente che l'uso del
   software è governato dalla licenza del repository "e non da questi Termini". La responsabilità
   sul software poggia quindi interamente sulla clausola di esclusione di garanzia della
   FSL-1.1-MIT, che c'è. Ma va saputo: se qualcuno subisce un danno usando Cycle, non è questa
   pagina a rispondere.
2. **"Ospitato su infrastruttura europea"** è un'affermazione di fatto dentro l'informativa privacy.
   Il sito è servito da nginx su un host proprio. Va verificato che sia davvero nell'UE, perché una
   dichiarazione sbagliata in un'informativa è peggio di una dichiarazione assente.
3. **La conservazione dei log** è "il minimo necessario secondo la policy del fornitore". Il Garante
   preferisce un periodo dichiarato. È il punto più debole delle tre pagine, ed è piccolo.
4. **Manca una clausola sulla disponibilità del sito** — nessun impegno a mantenerlo online, nessuna
   riserva di sospenderlo. Non è un obbligo, ma è la clausola più economica da aggiungere.

Per un sito informativo senza vendita, senza registrazione e senza tracciamento, questo impianto è
sopra la media di ciò che si vede in giro. Le quattro voci sopra sono da portare a un avvocato
insieme, non da correggere a intuito.
