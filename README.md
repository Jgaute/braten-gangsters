# Bråten gangsters

Ett top-down-actionspel i GTA2-stil som körs direkt i webbläsaren. Rent HTML, JavaScript och Canvas. Inga beroenden, ingen byggprocess och ingen server-logik.

## Köra lokalt

Ljud laddas med `fetch`, som inte fungerar om du dubbelklickar på `index.html` (file://). Starta i stället en enkel webbserver i mappen:

```bash
cd braten-gangsters
python3 -m http.server 8080
# öppna http://localhost:8080
```

## Självhosta

Det är bara statiska filer, så vilken webbserver som helst räcker.

**Docker (nginx):**

```bash
docker run -d --name braten-gangsters -p 8080:80 \
  -v /mnt/user/appdata/braten-gangsters:/usr/share/nginx/html:ro \
  nginx:alpine
```

Kopiera innehållet i den här mappen till volymen (exemplet ovan är en Unraid-sökväg) och surfa till `http://<server-ip>:8080`.

**GitHub Pages (gratis, alla kan surfa in och spela):**

1. Logga in på github.com, välj **New repository**, döp det till `braten-gangsters`, välj **Public** och klicka **Create repository**.
2. Klicka på länken **uploading an existing file**. Webbuppladdningen tar max 100 filer åt gången, så gör det i två omgångar:
   - Omgång 1: dra in `index.html`, `README.md` och mapparna `js` och `assets/audio` (dra mappen `audio` från `assets`). Klicka **Commit changes**.
   - Omgång 2: klicka **Add file → Upload files** och dra in mappen `assets/img`. Kolla att sökvägen blir `assets/img/...`. Om den hamnar fel, skapa först mappen `assets` och ladda upp inuti den. Klicka **Commit changes**.
3. Gå till **Settings → Pages**. Under **Build and deployment**, välj **Deploy from a branch**, branch **main** och mapp **/ (root)**. Klicka **Save**.
4. Efter en minut eller två ligger spelet på `https://<ditt-användarnamn>.github.io/braten-gangsters/`.

När du får en ny version laddar du upp de ändrade filerna på samma sätt. GitHub ersätter dem och sidan uppdateras inom någon minut.

Netlify eller en vanlig webbhost fungerar lika bra. Ladda upp mappen som den är.

## Kontroller

| | Till fots | I bil |
|---|---|---|
| Rörelse | WASD / piltangenter | W/S gas och broms, A/D styr |
| Sikta | Mus | – |
| Skjut / slå | Vänsterklick, Space, Ctrl | Vänsterklick, Ctrl (Knutter GT och stridsvagn) |
| Handbroms | – | Space |
| In/ur bil | F eller Enter | F eller Enter |
| Byt vapen | Q / E / 1–8 | – |
| Tuta | – | H |
| Paus / ljud | Esc eller P / M | Esc eller P / M |

Handkontroll stöds också: vänster spak för att gå och styra, RT gas, LT broms, X skjut, B handbroms, Y in och ur bil, LB byt vapen.

## Spelet

- **Jobb** får du från ringande telefonkiosker (gröna prickar på minikartan). Det finns fyra typer: leverera en bil i viss färg till ett garage, budkörning mot klockan, ta hand om en tjallare och spränga en bil.
- **Efterlysning** (stjärnorna) ökar om du begår brott när polisen ser det. På 1–2 stjärnor försöker polisen gripa dig, och från 3 stjärnor skjuter de.
- **Lack & Fix** (gul ruta på minikartan) lagar och lackar om alla fordon för $250 och nollställer polisen. Specialfordonen har egna färger: Knutter GT finns i lila, orange, turkos, rosa och guld, och stridsvagnen i grå, olivgrön, sand och vinterblå. En lackad polisbil blir en vanlig bil. Kör ut ur rutan och in igen för att lacka en gång till.
- **Safehouse** (lila prick på kartan): här bor Gaute knutters. Polisen kommer inte in genom grinden, gänget skjuter på poliser som närmar sig, efterlysningen försvinner snabbt och hälsan fylls på. På gården står den lila **Knutter GT** (klart snabbaste bilen i stan) med kulspruta på taket (sikta med musen, klicka för att skjuta) och tre motorcyklar. Förstörs Knutter GT kommer en ny efter 30 sekunder.
- **Stridsvagn** står också i safehouset. Den är mycket långsammare än vanliga bilar och svänger på stället. Bilar den kör på sprängs och den kör rakt över vraken. Pansaret tål ungefär 20 gånger mer än en vanlig bil. Tornet siktar med musen och kanonen skjuter granater som exploderar (en gång i sekunden). En förstörd stridsvagn ersätts efter 60 sekunder.
- **Skyddsväst** (blå väst, blå prickar på kartan) ger 100 i pansar som tar skada före hälsan, alltså dubbelt så mycket liv. En ligger i safehouset och fler i gränder runt om i stan.
- **Joggare:** fyra gäng med sex joggare i vita tröjor springer runt stan i rad (vita prickar på kartan). Kör över alla sex inom fyra sekunder så kommer *ELVIS HAS LEFT THE BUILDING* och $1 000.
- **Gränder:** kvarteren har genomgående gränder. Polisen ser dig bara om de har fri sikt, så göm dig bakom hus. Står du still i en gränd utan att någon ser dig sjunker stjärnorna snabbt.
- **Svärd** ligger i några gränder. Ett hugg träffar alla framför dig. Det är ett närstridsvapen som aldrig tar slut.
- **Gäng:** dina egna Gaute knutters kör runt i lila bilar och skjuter på polisen när du är efterlyst. Tar du en av deras bilar kliver knutten ur och låter dig köra. Två rivaliserande gäng har egna revir och bilar: **Hajarna** (turkos) och **Kobrorna** (rosa). Lämnar du dem i fred gör de dig inget. Skadar du en medlem eller deras bil, eller snor deras bil, är gänget ute efter dig en stund: de skjuter, och deras bilar jagar dig. Knuttarna i safehouset försvarar dig mot dem också. Reviren syns som turkosa och rosa prickar på kartan.
- **Folk i stan** har olika hudfärger, hårfärger och kläder.
- **Respekt:** varje gäng har en mätare uppe till höger, från −100 till +100. Jobb åt ett gäng ger +20 hos dem och sänker respekten hos de andra (−10 hos rivalerna, −5 hos knuttarna). Dödar du medlemmar eller spränger deras bilar sjunker respekten. Under −30 skjuter gänget på dig när de ser dig och svarar inte i sin telefon.
- **Gängjobb:** varje gäng har en egen telefon i sin färg (knuttarnas står i safehouset). Jobben kan vara gängkrig (ta ut fyra rivaler), att spränga en rivals bil, budkörning eller att leverera en bil.
- **Kill frenzy:** tre dödskallar ligger gömda i gränder. Plocka upp en så får du ett vapen och 60 sekunder: bränn 15 personer med eldkastaren, spräng 8 bilar med raketgeväret eller skjut 20 med kulsprutepistolen. Klarar du det får du $3 000. Under en frenzy ger brott bara 30 % av den vanliga efterlysningen.
- **Eldkastare** tänder på folk och bilar. **Raketgevär** skjuter raketer som exploderar. Båda finns i vapenlådor runt om i stan.
- **Dygn och väder:** ett dygn tar 8 minuter. På natten lyser gatlyktor, strålkastare och fönster, och det är färre människor ute. Vädret växlar mellan sol, mulet och regn. I regn blir vägarna hala och ibland åskar det. Klockan och vädret syns högst upp.
- Du börjar alltid med en pistol, även efter WASTED och BUSTED.
- **WASTED** betyder att du vaknar på sjukhuset. **BUSTED** betyder att du hamnar vid polisstationen och vapnen beslagtas.

## Struktur

```
index.html        startsida, meny och skript-taggar
js/util.js        matematik och hjälpfunktioner
js/assets.js      laddar grafik och skapar polisbil, brända bilar och poliser
js/audio.js       ljudfiler och syntetiska ljud (motorer per fordonstyp, däck, siren, tuta, explosion)
js/world.js       stadsgenerering, mark, hus i fejk-3D, minikarta
js/entities.js    bilfysik, trafik-AI, fotgängare, partiklar
js/game.js        spelare, vapen, polis, uppdrag, HUD, huvudloop
assets/img/       sprites (Kenney)
assets/audio/     ljud (Kenney och Free Firearm Sound Library, konverterade till mp3)
```

Staden genereras från ett frö (`seed` i `boot()` i `js/game.js`). Ändra siffran så får du en helt ny stad.

Byta grafik: lägg nya PNG-filer med samma filnamn i `assets/img/`. Bilarna ska peka uppåt och gubbarna åt höger.

## Licenser

- Grafik och ljudeffekter: [Kenney](https://kenney.nl), CC0 (public domain), inklusive Top-down Tanks Remastered
- Motorljud bilar: [racing car engine sound loops](https://opengameart.org/content/racing-car-engine-sound-loops) av domasx2, CC0
- Motorljud stridsvagn: [Engine-loop heavy vehicle/tank](https://opengameart.org/content/engine-loop-heavy-vehicletank) av Nayckron och qubodup, CC-BY 3.0
- Vapenljud: [The Free Firearm Sound Library](https://opengameart.org/content/the-free-firearm-sound-library), CC0
- Koden: din att göra vad du vill med
