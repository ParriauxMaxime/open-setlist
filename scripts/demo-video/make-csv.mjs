import { writeFileSync } from "node:fs";
const q = (s) => `"${String(s).replace(/"/g, '""')}"`;
const songs = [
  ["Brown Eyed Girl", "Rock", "Van Morrison", "G", "🎙️ + 🎸", "{t:Brown Eyed Girl}\r\n{st:Van Morrison}\r\n{comment:12A 🎸🥁}\r\n[G]Hey, where did [C]we go\r\n{genre:Rock}\r\n{tempo:150}\r\n{key:G}", 150, "3:03", ""],
  ["Le Bal des Lampions", "Vari&#233;t&#233;", "Les Fanfarons", "RÉm", "🎺 + 🎙️ + 🎹", "{t:Le Bal des Lampions}\r\n{st:Les Fanfarons}\r\n{comment:14C 🎹🎺}\r\n\r\n[Couplet 1]\r\n[Dm]Sous les lam[Gm]pions de la [A7]place\r\n{soh}Oh oh oh{eoh}\r\n\r\n{soc}\r\n[Dm]On danse en[C]core\r\n{eoc}\r\n{soc}\r\n{eoc}\r\n{genre:Variété}\r\n{tempo:132}\r\n{key:RÉm}\r\n{scrollspeed:4}", 132, "3:20", "Chant lead : Alice"],
  ["Marée Haute", "Rock", "Les Goélands", "LAm", "🎙️ + 🎸 + Solo🎸 (fin)", "{t:Marée Haute}\r\n{st:Les Goélands}\r\n{comment:22B 🎸🥁🪵}\r\n[Am]La mer [F]monte en[C]core [G]\r\n{genre:Rock}\r\n{tempo:118}\r\n{key:LAm}", 118, "3:45", ""],
  ["Valse des Quais", "Vari&#233;t&#233;", "Orchestre du Port", "SOL", "🎹 + 🪗", "{t:Valse des Quais}\r\n{st:Orchestre du Port}\r\n[G]Un deux [D7]trois, la valse [G]des quais\r\n{genre:Variété}\r\n{tempo:96}\r\n{key:SOL}", 96, "2:50", ""],
  ["Jolene", "Country", "Dolly Parton", "Am", "🎙️ Bob + 🎸", "{t:Jolene}\r\n{st:Dolly Parton}\r\n[Am]Jolene, Jolene\r\n{genre:Country}\r\n{tempo:112}\r\n{key:Am}", 112, "2:41", ""],
  ["Nuit Électrique", "Pop", "Les Néons", "MI♭", "🎙️ + 🎹 + 🥁", "{t:Nuit Électrique}\r\n{st:Les Néons}\r\n{comment:31D 🎹🥁}\r\n[Eb]Tout s'al[Bb]lume ce [Cm]soir\r\n{genre:Pop}\r\n{tempo:124}\r\n{key:MI♭}", 124, "3:30", ""],
];
const header = "Name,GenreName,ArtistName,Key,Notes,Lyrics,Tempo,SongLength,Other";
const body = songs.map((r) => r.map((v, i) => (i === 5 || /[",\r\n]/.test(String(v)) ? q(v) : v)).join(",")).join("\r\n");
const text = `${header}\r\n${body}\r\n`;
writeFileSync("SongCatalog.csv", Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, "utf16le")]));
console.log("ok");
