const COURT_PATTERNS = [
  {
    "nazev": "Nejvyšší správní soud",
    "kod": "NSSCRBR",
    "pattern": "nejvyss[a-z]*\\s+spravn[a-z]*\\s+soud[a-z]*"
  },
  {
    "nazev": "Nejvyšší soud",
    "kod": "NSCRBRN",
    "pattern": "nejvyss[a-z]*\\s+soud[a-z]*"
  },
  {
    "nazev": "Ústavní soud",
    "kod": "USCRBRN",
    "pattern": "ustavn[a-z]*\\s+soud[a-z]*"
  },
  {
    "nazev": "Krajský soud Brno",
    "kod": "KSJIMBM",
    "pattern": "krajsk[e|y|eho|emu|ym|ych]*\\s+soud[u|em|y|ech]*\\s+(?:v\\s+|ve\\s+)?brno[a-za-ž]*"
  },
  {
    "nazev": "Krajský soud České Budějovice",
    "kod": "KSJICCB",
    "pattern": "krajsk[e|y|eho|emu|ym|ych]*\\s+soud[u|em|y|ech]*\\s+(?:v\\s+|ve\\s+)?cesk[e|y]*\\s+budejovic"
  },
  {
    "nazev": "Krajský soud Hradec Králové",
    "kod": "KSVYCHK",
    "pattern": "krajsk[e|y|eho|emu|ym|ych]*\\s+soud[u|em|y|ech]*\\s+(?:v\\s+|ve\\s+)?hrad[e|c][c|e]\\s+kralov"
  },
  {
    "nazev": "Krajský soud Ostrava",
    "kod": "KSSEMOS",
    "pattern": "krajsk[e|y|eho|emu|ym|ych]*\\s+soud[u|em|y|ech]*\\s+(?:v\\s+|ve\\s+)?ostra[a-za-ž]*"
  },
  {
    "nazev": "Krajský soud Plzeň",
    "kod": "KSZPCPM",
    "pattern": "krajsk[e|y|eho|emu|ym|ych]*\\s+soud[u|em|y|ech]*\\s+(?:v\\s+|ve\\s+)?plzen[a-za-ž]*"
  },
  {
    "nazev": "Krajský soud Praha",
    "kod": "KSSTCAB",
    "pattern": "krajsk[e|y|eho|emu|ym|ych]*\\s+soud[u|em|y|ech]*\\s+(?:v\\s+|ve\\s+)?praha[a-za-ž]*"
  },
  {
    "nazev": "Krajský soud Ústí nad Labem",
    "kod": "KSSCEUL",
    "pattern": "krajsk[e|y|eho|emu|ym|ych]*\\s+soud[u|em|y|ech]*\\s+(?:v\\s+|ve\\s+)?ust[i]*\\s+(?:nad\\s+)?lab"
  },
  {
    "nazev": "Městský soud Praha",
    "kod": "MSPHAAB",
    "pattern": "mestsk[e|y|eho|emu|ym|ych]*\\s+soud[u|em|y|ech]*\\s+(?:v\\s+|ve\\s+)?prah[a|e|u]"
  },
  {
    "nazev": "Vrchní soud Olomouc",
    "kod": "VSSEMOL",
    "pattern": "vrchn[i|iho|im|ich]*\\s+soud[u|em|y|ech]*\\s+(?:v\\s+|ve\\s+)?olomo[a-za-ž]*"
  },
  {
    "nazev": "Vrchní soud Praha",
    "kod": "VSPHAAB",
    "pattern": "vrchn[i|iho|im|ich]*\\s+soud[u|em|y|ech]*\\s+(?:v\\s+|ve\\s+)?praha[a-za-ž]*"
  },
  {
    "nazev": "Městský soud Brno",
    "kod": "OSJIMBM",
    "pattern": "mestsk[e|y|eho|emu|ym|ych]*\\s+soud[u|em|y|ech]*\\s+(?:v\\s+|ve\\s+)?brn[o|e]"
  },
  {
    "nazev": "Obvodní soud Praha 1",
    "kod": "OSPHA01",
    "pattern": "obvodn[i|iho|im|ich]*\\s+soud[u|em|y|ech]*\\s+(?:pro\\s+)?prah[a|e|u]\\s+1\\b"
  },
  {
    "nazev": "Obvodní soud Praha 10",
    "kod": "OSPHA10",
    "pattern": "obvodn[i|iho|im|ich]*\\s+soud[u|em|y|ech]*\\s+(?:pro\\s+)?prah[a|e|u]\\s+10\\b"
  },
  {
    "nazev": "Obvodní soud Praha 2",
    "kod": "OSPHA02",
    "pattern": "obvodn[i|iho|im|ich]*\\s+soud[u|em|y|ech]*\\s+(?:pro\\s+)?prah[a|e|u]\\s+2\\b"
  },
  {
    "nazev": "Obvodní soud Praha 3",
    "kod": "OSPHA03",
    "pattern": "obvodn[i|iho|im|ich]*\\s+soud[u|em|y|ech]*\\s+(?:pro\\s+)?prah[a|e|u]\\s+3\\b"
  },
  {
    "nazev": "Obvodní soud Praha 4",
    "kod": "OSPHA04",
    "pattern": "obvodn[i|iho|im|ich]*\\s+soud[u|em|y|ech]*\\s+(?:pro\\s+)?prah[a|e|u]\\s+4\\b"
  },
  {
    "nazev": "Obvodní soud Praha 5",
    "kod": "OSPHA05",
    "pattern": "obvodn[i|iho|im|ich]*\\s+soud[u|em|y|ech]*\\s+(?:pro\\s+)?prah[a|e|u]\\s+5\\b"
  },
  {
    "nazev": "Obvodní soud Praha 6",
    "kod": "OSPHA06",
    "pattern": "obvodn[i|iho|im|ich]*\\s+soud[u|em|y|ech]*\\s+(?:pro\\s+)?prah[a|e|u]\\s+6\\b"
  },
  {
    "nazev": "Obvodní soud Praha 7",
    "kod": "OSPHA07",
    "pattern": "obvodn[i|iho|im|ich]*\\s+soud[u|em|y|ech]*\\s+(?:pro\\s+)?prah[a|e|u]\\s+7\\b"
  },
  {
    "nazev": "Obvodní soud Praha 8",
    "kod": "OSPHA08",
    "pattern": "obvodn[i|iho|im|ich]*\\s+soud[u|em|y|ech]*\\s+(?:pro\\s+)?prah[a|e|u]\\s+8\\b"
  },
  {
    "nazev": "Obvodní soud Praha 9",
    "kod": "OSPHA09",
    "pattern": "obvodn[i|iho|im|ich]*\\s+soud[u|em|y|ech]*\\s+(?:pro\\s+)?prah[a|e|u]\\s+9\\b"
  },
  {
    "nazev": "Okresní soud Benešov",
    "kod": "OSSTCBN",
    "pattern": "okresn[i|iho|im|ich]*\\s+soud[u|em|y|ech]*\\s+(?:v\\s+|ve\\s+)?benes[a-za-ž]*"
  },
  {
    "nazev": "Okresní soud Beroun",
    "kod": "OSSTCBE",
    "pattern": "okresn[i|iho|im|ich]*\\s+soud[u|em|y|ech]*\\s+(?:v\\s+|ve\\s+)?berou[a-za-ž]*"
  },
  {
    "nazev": "Okresní soud Blansko",
    "kod": "OSJIMBK",
    "pattern": "okresn[i|iho|im|ich]*\\s+soud[u|em|y|ech]*\\s+(?:v\\s+|ve\\s+)?blans[a-za-ž]*"
  },
  {
    "nazev": "Okresní soud Brno-venkov",
    "kod": "OSJIMBO",
    "pattern": "okresn[i|iho|im|ich]*\\s+soud[u|em|y|ech]*\\s+(?:v\\s+|ve\\s+)?brn[o|e]\\s*-\\s*venkov"
  },
  {
    "nazev": "Okresní soud Bruntál",
    "kod": "OSSEMBR",
    "pattern": "okresn[i|iho|im|ich]*\\s+soud[u|em|y|ech]*\\s+(?:v\\s+|ve\\s+)?brunt[a-za-ž]*"
  },
  {
    "nazev": "Okresní soud Břeclav",
    "kod": "OSJIMBV",
    "pattern": "okresn[i|iho|im|ich]*\\s+soud[u|em|y|ech]*\\s+(?:v\\s+|ve\\s+)?brecl[a-za-ž]*"
  },
  {
    "nazev": "Okresní soud Cheb",
    "kod": "OSZPCCH",
    "pattern": "okresn[i|iho|im|ich]*\\s+soud[u|em|y|ech]*\\s+(?:v\\s+|ve\\s+)?cheb[a-za-ž]*"
  },
  {
    "nazev": "Okresní soud Chomutov",
    "kod": "OSSCECV",
    "pattern": "okresn[i|iho|im|ich]*\\s+soud[u|em|y|ech]*\\s+(?:v\\s+|ve\\s+)?chomu[a-za-ž]*"
  },
  {
    "nazev": "Okresní soud Chrudim",
    "kod": "OSVYCCR",
    "pattern": "okresn[i|iho|im|ich]*\\s+soud[u|em|y|ech]*\\s+(?:v\\s+|ve\\s+)?chrud[a-za-ž]*"
  },
  {
    "nazev": "Okresní soud Česká Lípa",
    "kod": "OSSCECL",
    "pattern": "okresn[i|iho|im|ich]*\\s+soud[u|em|y|ech]*\\s+(?:v\\s+|ve\\s+)?ceska[a-za-ž]*"
  },
  {
    "nazev": "Okresní soud České Budějovice",
    "kod": "OSJICCB",
    "pattern": "okresn[i|iho|im|ich]*\\s+soud[u|em|y|ech]*\\s+(?:v\\s+|ve\\s+)?ceske[a-za-ž]*"
  },
  {
    "nazev": "Okresní soud Český Krumlov",
    "kod": "OSJICCK",
    "pattern": "okresn[i|iho|im|ich]*\\s+soud[u|em|y|ech]*\\s+(?:v\\s+|ve\\s+)?cesky[a-za-ž]*"
  },
  {
    "nazev": "Okresní soud Děčín",
    "kod": "OSSCEDC",
    "pattern": "okresn[i|iho|im|ich]*\\s+soud[u|em|y|ech]*\\s+(?:v\\s+|ve\\s+)?decin[a-za-ž]*"
  },
  {
    "nazev": "Okresní soud Domažlice",
    "kod": "OSZPCDO",
    "pattern": "okresn[i|iho|im|ich]*\\s+soud[u|em|y|ech]*\\s+(?:v\\s+|ve\\s+)?domaz[a-za-ž]*"
  },
  {
    "nazev": "Okresní soud Frýdek-Místek",
    "kod": "OSSEMFM",
    "pattern": "okresn[i|iho|im|ich]*\\s+soud[u|em|y|ech]*\\s+(?:v\\s+|ve\\s+)?fryde[a-za-ž]*"
  },
  {
    "nazev": "Okresní soud Havlíčkův Brod",
    "kod": "OSVYCHB",
    "pattern": "okresn[i|iho|im|ich]*\\s+soud[u|em|y|ech]*\\s+(?:v\\s+|ve\\s+)?havli[a-za-ž]*"
  },
  {
    "nazev": "Okresní soud Hodonín",
    "kod": "OSJIMHO",
    "pattern": "okresn[i|iho|im|ich]*\\s+soud[u|em|y|ech]*\\s+(?:v\\s+|ve\\s+)?hodon[a-za-ž]*"
  },
  {
    "nazev": "Okresní soud Hradec Králové",
    "kod": "OSVYCHK",
    "pattern": "okresn[i|iho|im|ich]*\\s+soud[u|em|y|ech]*\\s+(?:v\\s+|ve\\s+)?hrade[a-za-ž]*"
  },
  {
    "nazev": "Okresní soud Jablonec nad Nisou",
    "kod": "OSSCEJN",
    "pattern": "okresn[i|iho|im|ich]*\\s+soud[u|em|y|ech]*\\s+(?:v\\s+|ve\\s+)?jablo[a-za-ž]*"
  },
  {
    "nazev": "Okresní soud Jeseník",
    "kod": "OSSEMJE",
    "pattern": "okresn[i|iho|im|ich]*\\s+soud[u|em|y|ech]*\\s+(?:v\\s+|ve\\s+)?jesen[a-za-ž]*"
  },
  {
    "nazev": "Okresní soud Jičín",
    "kod": "OSVYCJC",
    "pattern": "okresn[i|iho|im|ich]*\\s+soud[u|em|y|ech]*\\s+(?:v\\s+|ve\\s+)?jicin[a-za-ž]*"
  },
  {
    "nazev": "Okresní soud Jihlava",
    "kod": "OSJIMJI",
    "pattern": "okresn[i|iho|im|ich]*\\s+soud[u|em|y|ech]*\\s+(?:v\\s+|ve\\s+)?jihla[a-za-ž]*"
  },
  {
    "nazev": "Okresní soud Jindřichův Hradec",
    "kod": "OSJICJH",
    "pattern": "okresn[i|iho|im|ich]*\\s+soud[u|em|y|ech]*\\s+(?:v\\s+|ve\\s+)?jindr[a-za-ž]*"
  },
  {
    "nazev": "Okresní soud Karlovy Vary",
    "kod": "OSZPCKV",
    "pattern": "okresn[i|iho|im|ich]*\\s+soud[u|em|y|ech]*\\s+(?:v\\s+|ve\\s+)?karlo[a-za-ž]*"
  },
  {
    "nazev": "Okresní soud Karviná",
    "kod": "OSSEMKA",
    "pattern": "okresn[i|iho|im|ich]*\\s+soud[u|em|y|ech]*\\s+(?:v\\s+|ve\\s+)?karvi[a-za-ž]*"
  },
  {
    "nazev": "Okresní soud Kladno",
    "kod": "OSSTCKL",
    "pattern": "okresn[i|iho|im|ich]*\\s+soud[u|em|y|ech]*\\s+(?:v\\s+|ve\\s+)?kladn[a-za-ž]*"
  },
  {
    "nazev": "Okresní soud Klatovy",
    "kod": "OSZPCKT",
    "pattern": "okresn[i|iho|im|ich]*\\s+soud[u|em|y|ech]*\\s+(?:v\\s+|ve\\s+)?klato[a-za-ž]*"
  },
  {
    "nazev": "Okresní soud Kolín",
    "kod": "OSSTCKO",
    "pattern": "okresn[i|iho|im|ich]*\\s+soud[u|em|y|ech]*\\s+(?:v\\s+|ve\\s+)?kolin[a-za-ž]*"
  },
  {
    "nazev": "Okresní soud Kroměříž",
    "kod": "OSJIMKM",
    "pattern": "okresn[i|iho|im|ich]*\\s+soud[u|em|y|ech]*\\s+(?:v\\s+|ve\\s+)?krome[a-za-ž]*"
  },
  {
    "nazev": "Okresní soud Kutná Hora",
    "kod": "OSSTCKH",
    "pattern": "okresn[i|iho|im|ich]*\\s+soud[u|em|y|ech]*\\s+(?:v\\s+|ve\\s+)?kutna[a-za-ž]*"
  },
  {
    "nazev": "Okresní soud Liberec",
    "kod": "OSSCELB",
    "pattern": "okresn[i|iho|im|ich]*\\s+soud[u|em|y|ech]*\\s+(?:v\\s+|ve\\s+)?liber[a-za-ž]*"
  },
  {
    "nazev": "Okresní soud Litoměřice",
    "kod": "OSSCELT",
    "pattern": "okresn[i|iho|im|ich]*\\s+soud[u|em|y|ech]*\\s+(?:v\\s+|ve\\s+)?litom[a-za-ž]*"
  },
  {
    "nazev": "Okresní soud Louny",
    "kod": "OSSCELN",
    "pattern": "okresn[i|iho|im|ich]*\\s+soud[u|em|y|ech]*\\s+(?:v\\s+|ve\\s+)?louny[a-za-ž]*"
  },
  {
    "nazev": "Okresní soud Mělník",
    "kod": "OSSTCME",
    "pattern": "okresn[i|iho|im|ich]*\\s+soud[u|em|y|ech]*\\s+(?:v\\s+|ve\\s+)?melni[a-za-ž]*"
  },
  {
    "nazev": "Okresní soud Mladá Boleslav",
    "kod": "OSSTCMB",
    "pattern": "okresn[i|iho|im|ich]*\\s+soud[u|em|y|ech]*\\s+(?:v\\s+|ve\\s+)?mlada[a-za-ž]*"
  },
  {
    "nazev": "Okresní soud Most",
    "kod": "OSSCEMO",
    "pattern": "okresn[i|iho|im|ich]*\\s+soud[u|em|y|ech]*\\s+(?:v\\s+|ve\\s+)?most[a-za-ž]*"
  },
  {
    "nazev": "Okresní soud Náchod",
    "kod": "OSVYCNA",
    "pattern": "okresn[i|iho|im|ich]*\\s+soud[u|em|y|ech]*\\s+(?:v\\s+|ve\\s+)?nacho[a-za-ž]*"
  },
  {
    "nazev": "Okresní soud Nový Jičín",
    "kod": "OSSEMNJ",
    "pattern": "okresn[i|iho|im|ich]*\\s+soud[u|em|y|ech]*\\s+(?:v\\s+|ve\\s+)?novy [a-za-ž]*"
  },
  {
    "nazev": "Okresní soud Nymburk",
    "kod": "OSSTCNB",
    "pattern": "okresn[i|iho|im|ich]*\\s+soud[u|em|y|ech]*\\s+(?:v\\s+|ve\\s+)?nymbu[a-za-ž]*"
  },
  {
    "nazev": "Okresní soud Olomouc",
    "kod": "OSSEMOC",
    "pattern": "okresn[i|iho|im|ich]*\\s+soud[u|em|y|ech]*\\s+(?:v\\s+|ve\\s+)?olomo[a-za-ž]*"
  },
  {
    "nazev": "Okresní soud Opava",
    "kod": "OSSEMOP",
    "pattern": "okresn[i|iho|im|ich]*\\s+soud[u|em|y|ech]*\\s+(?:v\\s+|ve\\s+)?opava[a-za-ž]*"
  },
  {
    "nazev": "Okresní soud Ostrava",
    "kod": "OSSEMOS",
    "pattern": "okresn[i|iho|im|ich]*\\s+soud[u|em|y|ech]*\\s+(?:v\\s+|ve\\s+)?ostra[a-za-ž]*"
  },
  {
    "nazev": "Okresní soud Pardubice",
    "kod": "OSVYCPA",
    "pattern": "okresn[i|iho|im|ich]*\\s+soud[u|em|y|ech]*\\s+(?:v\\s+|ve\\s+)?pardu[a-za-ž]*"
  },
  {
    "nazev": "Okresní soud Pelhřimov",
    "kod": "OSJICPE",
    "pattern": "okresn[i|iho|im|ich]*\\s+soud[u|em|y|ech]*\\s+(?:v\\s+|ve\\s+)?pelhr[a-za-ž]*"
  },
  {
    "nazev": "Okresní soud Písek",
    "kod": "OSJICPI",
    "pattern": "okresn[i|iho|im|ich]*\\s+soud[u|em|y|ech]*\\s+(?:v\\s+|ve\\s+)?pisek[a-za-ž]*"
  },
  {
    "nazev": "Okresní soud Plzeň-jih",
    "kod": "OSZPCPJ",
    "pattern": "okresn[i|iho|im|ich]*\\s+soud[u|em|y|ech]*\\s+(?:v\\s+|ve\\s+)?plz[e|n][n|i]\\s*-\\s*jih"
  },
  {
    "nazev": "Okresní soud Plzeň-Město",
    "kod": "OSZPCPM",
    "pattern": "okresn[i|iho|im|ich]*\\s+soud[u|em|y|ech]*\\s+(?:v\\s+|ve\\s+)?plz[e|n][n|i]\\s*-\\s*(?:m[e|e]st|mesta)"
  },
  {
    "nazev": "Okresní soud Plzeň-sever",
    "kod": "OSZPCPS",
    "pattern": "okresn[i|iho|im|ich]*\\s+soud[u|em|y|ech]*\\s+(?:v\\s+|ve\\s+)?plz[e|n][n|i]\\s*-\\s*sever"
  },
  {
    "nazev": "Okresní soud Prachatice",
    "kod": "OSJICPT",
    "pattern": "okresn[i|iho|im|ich]*\\s+soud[u|em|y|ech]*\\s+(?:v\\s+|ve\\s+)?prach[a-za-ž]*"
  },
  {
    "nazev": "Okresní soud Praha-Východ",
    "kod": "OSSTCPY",
    "pattern": "okresn[i|iho|im|ich]*\\s+soud[u|em|y|ech]*\\s+(?:v\\s+|ve\\s+)?prah[a|e|u]\\s*-\\s*vychod"
  },
  {
    "nazev": "Okresní soud Praha-Západ",
    "kod": "OSSTCPZ",
    "pattern": "okresn[i|iho|im|ich]*\\s+soud[u|em|y|ech]*\\s+(?:v\\s+|ve\\s+)?prah[a|e|u]\\s*-\\s*zapad"
  },
  {
    "nazev": "Okresní soud Prostějov",
    "kod": "OSJIMPV",
    "pattern": "okresn[i|iho|im|ich]*\\s+soud[u|em|y|ech]*\\s+(?:v\\s+|ve\\s+)?prost[a-za-ž]*"
  },
  {
    "nazev": "Okresní soud Přerov",
    "kod": "OSSEMPR",
    "pattern": "okresn[i|iho|im|ich]*\\s+soud[u|em|y|ech]*\\s+(?:v\\s+|ve\\s+)?prero[a-za-ž]*"
  },
  {
    "nazev": "Okresní soud Příbram",
    "kod": "OSSTCPB",
    "pattern": "okresn[i|iho|im|ich]*\\s+soud[u|em|y|ech]*\\s+(?:v\\s+|ve\\s+)?pribr[a-za-ž]*"
  },
  {
    "nazev": "Okresní soud Rakovník",
    "kod": "OSSTCRA",
    "pattern": "okresn[i|iho|im|ich]*\\s+soud[u|em|y|ech]*\\s+(?:v\\s+|ve\\s+)?rakov[a-za-ž]*"
  },
  {
    "nazev": "Okresní soud Rokycany",
    "kod": "OSZPCRO",
    "pattern": "okresn[i|iho|im|ich]*\\s+soud[u|em|y|ech]*\\s+(?:v\\s+|ve\\s+)?rokyc[a-za-ž]*"
  },
  {
    "nazev": "Okresní soud Rychnov nad Kněžnou",
    "kod": "OSVYCRK",
    "pattern": "okresn[i|iho|im|ich]*\\s+soud[u|em|y|ech]*\\s+(?:v\\s+|ve\\s+)?rychn[a-za-ž]*"
  },
  {
    "nazev": "Okresní soud Semily",
    "kod": "OSVYCSM",
    "pattern": "okresn[i|iho|im|ich]*\\s+soud[u|em|y|ech]*\\s+(?:v\\s+|ve\\s+)?semil[a-za-ž]*"
  },
  {
    "nazev": "Okresní soud Sokolov",
    "kod": "OSZPCSO",
    "pattern": "okresn[i|iho|im|ich]*\\s+soud[u|em|y|ech]*\\s+(?:v\\s+|ve\\s+)?sokol[a-za-ž]*"
  },
  {
    "nazev": "Okresní soud Strakonice",
    "kod": "OSJICST",
    "pattern": "okresn[i|iho|im|ich]*\\s+soud[u|em|y|ech]*\\s+(?:v\\s+|ve\\s+)?strak[a-za-ž]*"
  },
  {
    "nazev": "Okresní soud Svitavy",
    "kod": "OSVYCSY",
    "pattern": "okresn[i|iho|im|ich]*\\s+soud[u|em|y|ech]*\\s+(?:v\\s+|ve\\s+)?svita[a-za-ž]*"
  },
  {
    "nazev": "Okresní soud Šumperk",
    "kod": "OSSEMSU",
    "pattern": "okresn[i|iho|im|ich]*\\s+soud[u|em|y|ech]*\\s+(?:v\\s+|ve\\s+)?sumpe[a-za-ž]*"
  },
  {
    "nazev": "Okresní soud Tábor",
    "kod": "OSJICTA",
    "pattern": "okresn[i|iho|im|ich]*\\s+soud[u|em|y|ech]*\\s+(?:v\\s+|ve\\s+)?tabor[a-za-ž]*"
  },
  {
    "nazev": "Okresní soud Tachov",
    "kod": "OSZPCTC",
    "pattern": "okresn[i|iho|im|ich]*\\s+soud[u|em|y|ech]*\\s+(?:v\\s+|ve\\s+)?tacho[a-za-ž]*"
  },
  {
    "nazev": "Okresní soud Teplice",
    "kod": "OSSCETP",
    "pattern": "okresn[i|iho|im|ich]*\\s+soud[u|em|y|ech]*\\s+(?:v\\s+|ve\\s+)?tepli[a-za-ž]*"
  },
  {
    "nazev": "Okresní soud Trutnov",
    "kod": "OSVYCTU",
    "pattern": "okresn[i|iho|im|ich]*\\s+soud[u|em|y|ech]*\\s+(?:v\\s+|ve\\s+)?trutn[a-za-ž]*"
  },
  {
    "nazev": "Okresní soud Třebíč",
    "kod": "OSJIMTR",
    "pattern": "okresn[i|iho|im|ich]*\\s+soud[u|em|y|ech]*\\s+(?:v\\s+|ve\\s+)?trebi[a-za-ž]*"
  },
  {
    "nazev": "Okresní soud Uherské Hradiště",
    "kod": "OSJIMUH",
    "pattern": "okresn[i|iho|im|ich]*\\s+soud[u|em|y|ech]*\\s+(?:v\\s+|ve\\s+)?uhers[a-za-ž]*"
  },
  {
    "nazev": "Okresní soud Ústí nad Labem",
    "kod": "OSSCEUL",
    "pattern": "okresn[i|iho|im|ich]*\\s+soud[u|em|y|ech]*\\s+(?:v\\s+|ve\\s+)?usti\\s+nad\\s+labem"
  },
  {
    "nazev": "Okresní soud Ústí nad Orlicí",
    "kod": "OSVYCUO",
    "pattern": "okresn[i|iho|im|ich]*\\s+soud[u|em|y|ech]*\\s+(?:v\\s+|ve\\s+)?usti\\s+nad\\s+orlici"
  },
  {
    "nazev": "Okresní soud Vsetín",
    "kod": "OSSEMVS",
    "pattern": "okresn[i|iho|im|ich]*\\s+soud[u|em|y|ech]*\\s+(?:v\\s+|ve\\s+)?vseti[a-za-ž]*"
  },
  {
    "nazev": "Okresní soud Vyškov",
    "kod": "OSJIMVY",
    "pattern": "okresn[i|iho|im|ich]*\\s+soud[u|em|y|ech]*\\s+(?:v\\s+|ve\\s+)?vysko[a-za-ž]*"
  },
  {
    "nazev": "Okresní soud Zlín",
    "kod": "OSJIMZL",
    "pattern": "okresn[i|iho|im|ich]*\\s+soud[u|em|y|ech]*\\s+(?:v\\s+|ve\\s+)?zlin[a-za-ž]*"
  },
  {
    "nazev": "Okresní soud Znojmo",
    "kod": "OSJIMZN",
    "pattern": "okresn[i|iho|im|ich]*\\s+soud[u|em|y|ech]*\\s+(?:v\\s+|ve\\s+)?znojm[a-za-ž]*"
  },
  {
    "nazev": "Okresní soud Žďár nad Sázavou",
    "kod": "OSJIMZR",
    "pattern": "okresn[i|iho|im|ich]*\\s+soud[u|em|y|ech]*\\s+(?:v\\s+|ve\\s+)?zdar [a-za-ž]*"
  }
];

// ─────────────────────────────────────────────────────────────────────────────
//  DETEKCE SOUDU Z TEXTU — robustní, datově řízená (v3, 2026-08)
//
//  Dřívější detekce spoléhala na ruční regexy v COURT_PATTERNS, které matchovaly
//  jen 1. pád města ("Brno", ne "Brně") → v reálných podáních („Krajskému soudu
//  v Brně") NIC nedetekovaly a v jednom případě dokonce vracely ŠPATNÝ soud
//  (České Budějovice → Český Krumlov). To je u přiřazení datové schránky vážné.
//
//  Nový algoritmus:
//   1) rozpozná TYP soudu (nejvyšší/ústavní/vrchní/krajský/městský/obvodní/okresní),
//   2) z názvů v registru (COURT_REGISTRY) staví tokeny lokusu tolerantní ke
//      skloňování (kmeny + speciální případy Praha, Hradec, Plzeň, Frýdek-Místek…),
//   3) vybere soud, jehož VŠECHNY tokeny se v textu vyskytují, a to ten
//      NEJSPECIFIČTĚJŠÍ (nejvíc tokenů → Nový Jičín > Jičín, Ústí n. Labem vs
//      n. Orlicí, Plzeň-jih/-město/-sever, Praha 1 vs 10),
//   4) při nejednoznačnosti (0 nebo víc kandidátů se stejnou specificitou) vrací
//      null — RADŠI NIC než špatná datovka.
//  Pravidla ověřena testovací maticí (tests/unit/court-consistency.test.js).
// ─────────────────────────────────────────────────────────────────────────────

function _cdStrip(s) {
    return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

// Speciální kmeny měst s palatalizací / vkladným „e" (nominativ → ostatní pády).
var _CD_STEM_SPECIAL = {
    praha: 'prah|praz', plzen: 'plzen|plzn', hradec: 'hradec|hradc|hradci',
    jablonec: 'jablonec|jablonc', liberec: 'liberec|liberc', litomerice: 'litomeric',
    klatovy: 'klatov', karvina: 'karvin', teplice: 'teplic',
    frydek: 'fryde?k', mistek: 'miste?k'
};
var _CD_LOCUS_STOP = { nad: 1, pod: 1, pri: 1, v: 1, ve: 1, pro: 1, a: 1 };

function _cdWordStem(w) {
    var b = _cdStrip(w).replace(/[^a-z0-9]/g, '');
    if (!b) return null;
    if (/^\d+$/.test(b)) return { num: b };
    if (b.indexOf('prah') === 0 || b.indexOf('praz') === 0) return { rx: 'prah|praz' };
    if (_CD_STEM_SPECIAL[b]) return { rx: _CD_STEM_SPECIAL[b] };
    var stem = b.replace(/uv$/, '').replace(/[aeiouyů]+$/, '');
    if (stem.length < 3) stem = b;
    return { rx: stem };
}

function _cdNazevToType(nazev) {
    var n = _cdStrip(nazev);
    if (/nejvyss\w*\s+spravn/.test(n)) return 'nsspravni';
    if (/nejvyss/.test(n)) return 'ns';
    if (/ustavn/.test(n)) return 'us';
    if (/vrchn/.test(n)) return 'vrchni';
    if (/krajsk/.test(n)) return 'krajsky';
    if (/mestsk/.test(n)) return 'mestsky';
    if (/obvodn/.test(n)) return 'obvodni';
    if (/okresn/.test(n)) return 'okresni';
    return null;
}

function _cdTokensFromNazev(nazev) {
    var n = _cdStrip(nazev)
        .replace(/^(nejvyssi spravni soud|nejvyssi soud|ustavni soud|vrchni soud|krajsky soud|mestsky soud|obvodni soud|okresni soud)\s*/, '')
        .replace(/^(v|ve|pro)\s+/, '')
        .trim();
    if (!n) return [];
    var words = n.split(/[\s-]+/).filter(Boolean);
    var toks = [];
    for (var i = 0; i < words.length; i++) {
        var wb = words[i].replace(/[^a-z0-9]/g, '');
        if (!wb || _CD_LOCUS_STOP[wb]) continue;
        var t = _cdWordStem(wb);
        if (!t) continue;
        var dup = toks.some(function (x) { return (x.num && t.num && x.num === t.num) || (x.rx && t.rx && x.rx === t.rx); });
        if (!dup) toks.push(t);
    }
    return toks;
}

// Typy s jednoznačným soudem (nepotřebují město).
var _CD_TYPE_SINGLE = { nsspravni: 'Nejvyšší správní soud', ns: 'Nejvyšší soud', us: 'Ústavní soud' };
var _CD_TYPE_ORDER = [
    ['nsspravni', /nejvyss\w*\s+spravn\w*\s+soud\w*/],
    ['ns', /nejvyss\w*\s+soud\w*/],
    ['us', /ustavn\w*\s+soud\w*/],
    ['vrchni', /vrchn\w*\s+soud\w*/],
    ['krajsky', /krajsk\w*\s+soud\w*/],
    ['mestsky', /mestsk\w*\s+soud\w*/],
    ['obvodni', /obvodn\w*\s+soud\w*/],
    ['okresni', /okresn\w*\s+soud\w*/]
];

var _cdRulesCache = null;
function _cdGetRegistry() {
    if (typeof window !== 'undefined' && window.COURT_REGISTRY) return window.COURT_REGISTRY;
    if (typeof module !== 'undefined' && module.exports) {
        try { return require('./court-registry.js').COURT_REGISTRY; } catch (e) { return null; }
    }
    return null;
}
function _cdRules() {
    if (_cdRulesCache) return _cdRulesCache;
    var reg = _cdGetRegistry();
    if (!reg) return null; // registr ještě nenačten → zkusíme příště
    _cdRulesCache = reg.map(function (c) {
        var toks = _cdTokensFromNazev(c.nazev);
        return { nazev: c.nazev, isds: c.isds, type: _cdNazevToType(c.nazev), tokens: toks, spec: toks.length };
    });
    return _cdRulesCache;
}

function _cdTokenMatches(tok, text) {
    if (tok.num) return new RegExp('(?<!\\d)' + tok.num + '(?!\\d)').test(text);
    return new RegExp('\\b(?:' + tok.rx + ')[a-z]*', 'i').test(text);
}

// Jediný zdroj detekce soudu z textu (volají lexis-reply, lexis-datovka,
// lexis-ui, lexis-ui-5). Vrací { nazev, isds } nebo null.
function detectCourt(text) {
    if (!text) return null;
    var t = _cdStrip(text);
    var type = null;
    for (var i = 0; i < _CD_TYPE_ORDER.length; i++) {
        if (_CD_TYPE_ORDER[i][1].test(t)) { type = _CD_TYPE_ORDER[i][0]; break; }
    }
    if (!type) return null;
    if (_CD_TYPE_SINGLE[type]) {
        var single = _cdGetRegistry() ? (_cdRules() || []).find(function (r) { return r.nazev === _CD_TYPE_SINGLE[type]; }) : null;
        return { nazev: _CD_TYPE_SINGLE[type], isds: single ? single.isds : null };
    }
    var rules = _cdRules();
    if (!rules) return null;
    var best = [], bestScore = 0;
    for (var j = 0; j < rules.length; j++) {
        var r = rules[j];
        if (r.type !== type || !r.tokens.length) continue;
        var ok = r.tokens.every(function (tok) { return _cdTokenMatches(tok, t); });
        if (!ok) continue;
        if (r.spec > bestScore) { bestScore = r.spec; best = [r]; }
        else if (r.spec === bestScore) best.push(r);
    }
    if (best.length === 1) return { nazev: best[0].nazev, isds: best[0].isds };
    return null; // nejednoznačné → radši nic (riziko špatné datovky)
}

const LexisCourt = { detect: detectCourt, COURT_PATTERNS };

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { COURT_PATTERNS, detectCourt, LexisCourt };
} else {
    window.COURT_PATTERNS = COURT_PATTERNS;
    window.LexisCourt = LexisCourt;
}
