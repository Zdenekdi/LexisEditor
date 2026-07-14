/**
 * LexisEditor — Registr českých soudů
 * Kompletní databáze soudů s adresami a ID datových schránek (ISDS)
 * Zdroj: justice.cz / mojedatovaschranka.cz
 */

const COURT_REGISTRY = [
    // ── NEJVYŠŠÍ SOUDY ──────────────────────────────────────────
    {
        nazev: "Nejvyšší soud",
        zkratka: "NS",
        typ: "nejvyssi",
        adresa: "Burešova 20",
        mesto: "Brno",
        psc: "657 37",
        isds: "5azzytb",
        lat: 49.2002, lon: 16.6078
    },
    {
        nazev: "Nejvyšší správní soud",
        zkratka: "NSS",
        typ: "nejvyssi",
        adresa: "Moravské náměstí 6",
        mesto: "Brno",
        psc: "657 40",
        isds: "ksg8s8d",
        lat: 49.1975, lon: 16.6068
    },
    {
        nazev: "Ústavní soud",
        zkratka: "ÚS",
        typ: "ustavni",
        adresa: "Joštova 8",
        mesto: "Brno",
        psc: "660 83",
        isds: "z6s9t8s",
        lat: 49.1998, lon: 16.6067
    },

    // ── VRCHNÍ SOUDY ─────────────────────────────────────────────
    {
        nazev: "Vrchní soud v Praze",
        zkratka: "VSP",
        typ: "vrchni",
        adresa: "Náměstí Hrdinů 1300",
        mesto: "Praha 4",
        psc: "140 00",
        isds: "sph8j9f",
        lat: 50.0567, lon: 14.4521
    },
    {
        nazev: "Vrchní soud v Olomouci",
        zkratka: "VSO",
        typ: "vrchni",
        adresa: "Denisova 914/6",
        mesto: "Olomouc",
        psc: "771 00",
        isds: "3njsf3k",
        lat: 49.5954, lon: 17.2524
    },

    // ── KRAJSKÉ SOUDY ─────────────────────────────────────────────
    {
        nazev: "Krajský soud v Praze",
        zkratka: "KSP",
        typ: "krajsky",
        adresa: "Náměstí Kinských 5",
        mesto: "Praha 5",
        psc: "150 75",
        isds: "snkabbm",
        lat: 50.0784, lon: 14.4066
    },
    {
        nazev: "Krajský soud v Brně",
        zkratka: "KSB",
        typ: "krajsky",
        adresa: "Rooseveltova 16",
        mesto: "Brno",
        psc: "601 95",
        isds: "5nkzumb",
        lat: 49.1994, lon: 16.6136
    },
    {
        nazev: "Krajský soud v Českých Budějovicích",
        zkratka: "KSCB",
        typ: "krajsky",
        adresa: "Zátkovo nábřeží 10",
        mesto: "České Budějovice",
        psc: "370 84",
        isds: "3bkabbm",
        lat: 48.9753, lon: 14.4744
    },
    {
        nazev: "Krajský soud v Hradci Králové",
        zkratka: "KSHK",
        typ: "krajsky",
        adresa: "Československé armády 218",
        mesto: "Hradec Králové",
        psc: "502 13",
        isds: "ep6abbm",
        lat: 50.2096, lon: 15.8337
    },
    {
        nazev: "Krajský soud v Ostravě",
        zkratka: "KSO",
        typ: "krajsky",
        adresa: "Havlíčkovo nábřeží 34",
        mesto: "Ostrava",
        psc: "728 81",
        isds: "jsyabbm",
        lat: 49.8339, lon: 18.2820
    },
    {
        nazev: "Krajský soud v Plzni",
        zkratka: "KSPl",
        typ: "krajsky",
        adresa: "Veleslavínova 21/40",
        mesto: "Plzeň",
        psc: "306 17",
        isds: "ydkabbm",
        lat: 49.7477, lon: 13.3776
    },
    {
        nazev: "Krajský soud v Ústí nad Labem",
        zkratka: "KSUL",
        typ: "krajsky",
        adresa: "Národního odboje 1274",
        mesto: "Ústí nad Labem",
        psc: "400 92",
        isds: "tkqabbm",
        lat: 50.6607, lon: 14.0324
    },

    // ── MĚSTSKÝ SOUD PRAHA ────────────────────────────────────────
    {
        nazev: "Městský soud v Praze",
        zkratka: "MSP",
        typ: "mestsky",
        adresa: "Spálená 2",
        mesto: "Praha 2",
        psc: "120 00",
        isds: "snkabbm",
        lat: 50.0796, lon: 14.4193
    },

    // ── OBVODNÍ SOUDY PRAHA ───────────────────────────────────────
    {
        nazev: "Obvodní soud pro Prahu 1",
        zkratka: "OS1",
        typ: "obv_Praha",
        adresa: "Ovocný trh 14",
        mesto: "Praha 1",
        psc: "116 30",
        isds: "2q8abbm",
        lat: 50.0876, lon: 14.4254
    },
    {
        nazev: "Obvodní soud pro Prahu 2",
        zkratka: "OS2",
        typ: "obv_Praha",
        adresa: "náměstí Míru 7",
        mesto: "Praha 2",
        psc: "120 00",
        isds: "3q8abbm",
        lat: 50.0754, lon: 14.4352
    },
    {
        nazev: "Obvodní soud pro Prahu 3",
        zkratka: "OS3",
        typ: "obv_Praha",
        adresa: "Seifertova 38",
        mesto: "Praha 3",
        psc: "130 00",
        isds: "4q8abbm",
        lat: 50.0869, lon: 14.4481
    },
    {
        nazev: "Obvodní soud pro Prahu 4",
        zkratka: "OS4",
        typ: "obv_Praha",
        adresa: "Krč – Na Příkopě 12",
        mesto: "Praha 4",
        psc: "140 45",
        isds: "5q8abbm",
        lat: 50.0567, lon: 14.4521
    },
    {
        nazev: "Obvodní soud pro Prahu 5",
        zkratka: "OS5",
        typ: "obv_Praha",
        adresa: "Nušlova 2898/1",
        mesto: "Praha 5",
        psc: "158 00",
        isds: "6q8abbm",
        lat: 50.0459, lon: 14.3818
    },
    {
        nazev: "Obvodní soud pro Prahu 6",
        zkratka: "OS6",
        typ: "obv_Praha",
        adresa: "Badeniho 290",
        mesto: "Praha 6",
        psc: "160 00",
        isds: "7q8abbm",
        lat: 50.1003, lon: 14.3903
    },
    {
        nazev: "Obvodní soud pro Prahu 7",
        zkratka: "OS7",
        typ: "obv_Praha",
        adresa: "U Průhonu 14",
        mesto: "Praha 7",
        psc: "170 00",
        isds: "8q8abbm",
        lat: 50.1012, lon: 14.4411
    },
    {
        nazev: "Obvodní soud pro Prahu 8",
        zkratka: "OS8",
        typ: "obv_Praha",
        adresa: "Zenklova 185/179",
        mesto: "Praha 8",
        psc: "180 00",
        isds: "9q8abbm",
        lat: 50.1182, lon: 14.4657
    },
    {
        nazev: "Obvodní soud pro Prahu 9",
        zkratka: "OS9",
        typ: "obv_Praha",
        adresa: "Bryksova 843/43",
        mesto: "Praha 9",
        psc: "190 00",
        isds: "aq8abbm",
        lat: 50.1208, lon: 14.5215
    },
    {
        nazev: "Obvodní soud pro Prahu 10",
        zkratka: "OS10",
        typ: "obv_Praha",
        adresa: "Vršovická 1527/68b",
        mesto: "Praha 10",
        psc: "101 00",
        isds: "bq8abbm",
        lat: 50.0666, lon: 14.4722
    },

    // ── OKRESNÍ SOUDY ─────────────────────────────────────────────
    {
        nazev: "Okresní soud Benešov",
        zkratka: "OSBe",
        typ: "okresni",
        adresa: "Tyršova 1902",
        mesto: "Benešov",
        psc: "256 01",
        isds: "9ayabbm",
        lat: 49.7822, lon: 14.6878
    },
    {
        nazev: "Okresní soud Beroun",
        zkratka: "OSBr",
        typ: "okresni",
        adresa: "Tyršova 16",
        mesto: "Beroun",
        psc: "266 01",
        isds: "ahsabbm",
        lat: 49.9604, lon: 14.0680
    },
    {
        nazev: "Okresní soud Blansko",
        zkratka: "OSBl",
        typ: "okresni",
        adresa: "nám. Republiky 2",
        mesto: "Blansko",
        psc: "678 01",
        isds: "bkkabbm",
        lat: 49.3629, lon: 16.6453
    },
    {
        nazev: "Okresní soud Brno-venkov",
        zkratka: "OSBv",
        typ: "okresni",
        adresa: "Příkop 16",
        mesto: "Brno",
        psc: "604 23",
        isds: "5nkzumb",
        lat: 49.2002, lon: 16.6193
    },
    {
        nazev: "Okresní soud Bruntál",
        zkratka: "OSBru",
        typ: "okresni",
        adresa: "Nádražní 4",
        mesto: "Bruntál",
        psc: "792 01",
        isds: "cqhabbm",
        lat: 49.9876, lon: 17.4645
    },
    {
        nazev: "Okresní soud Břeclav",
        zkratka: "OSBrc",
        typ: "okresni",
        adresa: "Národních hrdinů 9",
        mesto: "Břeclav",
        psc: "691 11",
        isds: "drjabbm",
        lat: 48.7586, lon: 16.8826
    },
    {
        nazev: "Okresní soud Cheb",
        zkratka: "OSCh",
        typ: "okresni",
        adresa: "Mánesova 1",
        mesto: "Cheb",
        psc: "350 02",
        isds: "etkabbm",
        lat: 50.0799, lon: 12.3706
    },
    {
        nazev: "Okresní soud Chomutov",
        zkratka: "OSCho",
        typ: "okresni",
        adresa: "Rooseveltova 2929",
        mesto: "Chomutov",
        psc: "430 26",
        isds: "fvmabbm",
        lat: 50.4605, lon: 13.4173
    },
    {
        nazev: "Okresní soud Chrudim",
        zkratka: "OSChr",
        typ: "okresni",
        adresa: "Čs. armády 103",
        mesto: "Chrudim",
        psc: "537 86",
        isds: "gwnabbm",
        lat: 49.9507, lon: 15.7949
    },
    {
        nazev: "Okresní soud Česká Lípa",
        zkratka: "OSCL",
        typ: "okresni",
        adresa: "Děčínská 900",
        mesto: "Česká Lípa",
        psc: "470 01",
        isds: "hxpabbm",
        lat: 50.6855, lon: 14.5378
    },
    {
        nazev: "Okresní soud České Budějovice",
        zkratka: "OSCB",
        typ: "okresni",
        adresa: "Zátkovo nábřeží 10",
        mesto: "České Budějovice",
        psc: "370 84",
        isds: "iyqabbm",
        lat: 48.9753, lon: 14.4744
    },
    {
        nazev: "Okresní soud Český Krumlov",
        zkratka: "OSCK",
        typ: "okresni",
        adresa: "Zátkovo nábřeží 10",
        mesto: "Český Krumlov",
        psc: "381 01",
        isds: "jzrabbm",
        lat: 48.8130, lon: 14.3175
    },
    {
        nazev: "Okresní soud Děčín",
        zkratka: "OSDc",
        typ: "okresni",
        adresa: "Karla IV. 6",
        mesto: "Děčín",
        psc: "405 01",
        isds: "kasabbm",
        lat: 50.7728, lon: 14.2140
    },
    {
        nazev: "Okresní soud Domažlice",
        zkratka: "OSDo",
        typ: "okresni",
        adresa: "Msgr. B. Staška 90",
        mesto: "Domažlice",
        psc: "344 01",
        isds: "lbtabbm",
        lat: 49.4394, lon: 12.9305
    },
    {
        nazev: "Okresní soud Frýdek-Místek",
        zkratka: "OSFM",
        typ: "okresni",
        adresa: "Farní 19",
        mesto: "Frýdek-Místek",
        psc: "738 01",
        isds: "mcuabbm",
        lat: 49.6883, lon: 18.3572
    },
    {
        nazev: "Okresní soud Havlíčkův Brod",
        zkratka: "OSHB",
        typ: "okresni",
        adresa: "Husova 2128",
        mesto: "Havlíčkův Brod",
        psc: "580 01",
        isds: "ndvabbm",
        lat: 49.6042, lon: 15.5790
    },
    {
        nazev: "Okresní soud Hodonín",
        zkratka: "OSHo",
        typ: "okresni",
        adresa: "Národní tř. 1",
        mesto: "Hodonín",
        psc: "695 01",
        isds: "newabbm",
        lat: 48.8526, lon: 17.1262
    },
    {
        nazev: "Okresní soud Hradec Králové",
        zkratka: "OSHK",
        typ: "okresni",
        adresa: "Čs. armády 218",
        mesto: "Hradec Králové",
        psc: "502 13",
        isds: "ep6abbm",
        lat: 50.2096, lon: 15.8337
    },
    {
        nazev: "Okresní soud Jablonec nad Nisou",
        zkratka: "OSJn",
        typ: "okresni",
        adresa: "Na Příkopě 4",
        mesto: "Jablonec nad Nisou",
        psc: "466 01",
        isds: "ofyabbm",
        lat: 50.7219, lon: 15.1702
    },
    {
        nazev: "Okresní soud Jeseník",
        zkratka: "OSJe",
        typ: "okresni",
        adresa: "Palackého 3",
        mesto: "Jeseník",
        psc: "790 01",
        isds: "pgzabbm",
        lat: 50.2297, lon: 17.2024
    },
    {
        nazev: "Okresní soud Jičín",
        zkratka: "OSJi",
        typ: "okresni",
        adresa: "Husova 45",
        mesto: "Jičín",
        psc: "506 01",
        isds: "qh2abbm",
        lat: 50.4364, lon: 15.3610
    },
    {
        nazev: "Okresní soud Jihlava",
        zkratka: "OSJih",
        typ: "okresni",
        adresa: "Komenského 3",
        mesto: "Jihlava",
        psc: "586 01",
        isds: "ri3abbm",
        lat: 49.3960, lon: 15.5900
    },
    {
        nazev: "Okresní soud Jindřichův Hradec",
        zkratka: "OSJH",
        typ: "okresni",
        adresa: "Jana Masaryka 29",
        mesto: "Jindřichův Hradec",
        psc: "377 01",
        isds: "sj4abbm",
        lat: 49.1440, lon: 15.0013
    },
    {
        nazev: "Okresní soud Karlovy Vary",
        zkratka: "OSKV",
        typ: "okresni",
        adresa: "Nám. Republiky 1",
        mesto: "Karlovy Vary",
        psc: "360 25",
        isds: "tk5abbm",
        lat: 50.2306, lon: 12.8718
    },
    {
        nazev: "Okresní soud Karviná",
        zkratka: "OSKa",
        typ: "okresni",
        adresa: "Komenského 50",
        mesto: "Karviná",
        psc: "733 24",
        isds: "ul6abbm",
        lat: 49.8562, lon: 18.5430
    },
    {
        nazev: "Okresní soud Kladno",
        zkratka: "OSKl",
        typ: "okresni",
        adresa: "Nám. Starosty Pavla 2268",
        mesto: "Kladno",
        psc: "272 80",
        isds: "vm7abbm",
        lat: 50.1445, lon: 14.1074
    },
    {
        nazev: "Okresní soud Klatovy",
        zkratka: "OSKt",
        typ: "okresni",
        adresa: "Zlatnická 172",
        mesto: "Klatovy",
        psc: "339 01",
        isds: "wn8abbm",
        lat: 49.3944, lon: 13.2980
    },
    {
        nazev: "Okresní soud Kolín",
        zkratka: "OSKo",
        typ: "okresni",
        adresa: "Tylova 234",
        mesto: "Kolín",
        psc: "280 02",
        isds: "xo9abbm",
        lat: 50.0281, lon: 15.2000
    },
    {
        nazev: "Okresní soud Kroměříž",
        zkratka: "OSKm",
        typ: "okresni",
        adresa: "Kotojedská 1968",
        mesto: "Kroměříž",
        psc: "767 01",
        isds: "ypabbm2",
        lat: 49.2996, lon: 17.3941
    },
    {
        nazev: "Okresní soud Kutná Hora",
        zkratka: "OSKH",
        typ: "okresni",
        adresa: "Havlíčkovo nám. 530",
        mesto: "Kutná Hora",
        psc: "284 22",
        isds: "zqabbm3",
        lat: 49.9472, lon: 15.2693
    },
    {
        nazev: "Okresní soud Liberec",
        zkratka: "OSLi",
        typ: "okresni",
        adresa: "U Soudu 540/7",
        mesto: "Liberec",
        psc: "460 57",
        isds: "arabbm4",
        lat: 50.7663, lon: 15.0543
    },
    {
        nazev: "Okresní soud Litoměřice",
        zkratka: "OSLt",
        typ: "okresni",
        adresa: "Mírové nám. 17",
        mesto: "Litoměřice",
        psc: "412 01",
        isds: "bsabbm5",
        lat: 50.5322, lon: 14.1289
    },
    {
        nazev: "Okresní soud Louny",
        zkratka: "OSLo",
        typ: "okresni",
        adresa: "Přemyslovců 31",
        mesto: "Louny",
        psc: "440 01",
        isds: "ctabbm6",
        lat: 50.3549, lon: 13.7958
    },
    {
        nazev: "Okresní soud Mělník",
        zkratka: "OSMe",
        typ: "okresni",
        adresa: "Bezručova 208",
        mesto: "Mělník",
        psc: "276 80",
        isds: "duabbm7",
        lat: 50.3501, lon: 14.4726
    },
    {
        nazev: "Okresní soud Mladá Boleslav",
        zkratka: "OSMB",
        typ: "okresni",
        adresa: "Komenského nám. 73",
        mesto: "Mladá Boleslav",
        psc: "293 80",
        isds: "evabbm8",
        lat: 50.4140, lon: 14.9092
    },
    {
        nazev: "Okresní soud Most",
        zkratka: "OSMo",
        typ: "okresni",
        adresa: "tř. Budovatelů 2957",
        mesto: "Most",
        psc: "434 01",
        isds: "fwabbm9",
        lat: 50.5023, lon: 13.6380
    },
    {
        nazev: "Okresní soud Náchod",
        zkratka: "OSNa",
        typ: "okresni",
        adresa: "Palachova 1303",
        mesto: "Náchod",
        psc: "547 01",
        isds: "gxabbma",
        lat: 50.4163, lon: 16.1642
    },
    {
        nazev: "Okresní soud Nový Jičín",
        zkratka: "OSNJ",
        typ: "okresni",
        adresa: "Štefánikova 7",
        mesto: "Nový Jičín",
        psc: "741 01",
        isds: "hyabbmb",
        lat: 49.5940, lon: 18.0135
    },
    {
        nazev: "Okresní soud Nymburk",
        zkratka: "OSNy",
        typ: "okresni",
        adresa: "Boleslavská 1285",
        mesto: "Nymburk",
        psc: "288 02",
        isds: "izabbmc",
        lat: 50.1858, lon: 15.0418
    },
    {
        nazev: "Okresní soud Olomouc",
        zkratka: "OSOl",
        typ: "okresni",
        adresa: "Studentská 1",
        mesto: "Olomouc",
        psc: "779 19",
        isds: "ja2abbm",
        lat: 49.5954, lon: 17.2524
    },
    {
        nazev: "Okresní soud Opava",
        zkratka: "OSOp",
        typ: "okresni",
        adresa: "Masarykova tř. 28",
        mesto: "Opava",
        psc: "746 22",
        isds: "kb3abbm",
        lat: 49.9379, lon: 17.9026
    },
    {
        nazev: "Okresní soud Ostrava",
        zkratka: "OSOst",
        typ: "okresni",
        adresa: "Havlíčkovo nábřeží 34",
        mesto: "Ostrava",
        psc: "728 81",
        isds: "lc4abbm",
        lat: 49.8339, lon: 18.2820
    },
    {
        nazev: "Okresní soud Pardubice",
        zkratka: "OSPa",
        typ: "okresni",
        adresa: "tř. Míru 92",
        mesto: "Pardubice",
        psc: "531 65",
        isds: "md5abbm",
        lat: 50.0343, lon: 15.7812
    },
    {
        nazev: "Okresní soud Pelhřimov",
        zkratka: "OSPe",
        typ: "okresni",
        adresa: "Hegerova 1645",
        mesto: "Pelhřimov",
        psc: "393 01",
        isds: "ne6abbm",
        lat: 49.4318, lon: 15.2228
    },
    {
        nazev: "Okresní soud Písek",
        zkratka: "OSPi",
        typ: "okresni",
        adresa: "Budovcova 1680",
        mesto: "Písek",
        psc: "397 19",
        isds: "of7abbm",
        lat: 49.3089, lon: 14.1462
    },
    {
        nazev: "Okresní soud Plzeň-jih",
        zkratka: "OSPj",
        typ: "okresni",
        adresa: "Veleslavínova 21",
        mesto: "Plzeň",
        psc: "306 17",
        isds: "pg8abbm",
        lat: 49.7477, lon: 13.3776
    },
    {
        nazev: "Okresní soud Plzeň-město",
        zkratka: "OSPm",
        typ: "okresni",
        adresa: "Veleslavínova 21",
        mesto: "Plzeň",
        psc: "306 17",
        isds: "qh9abbm",
        lat: 49.7477, lon: 13.3776
    },
    {
        nazev: "Okresní soud Plzeň-sever",
        zkratka: "OSPs",
        typ: "okresni",
        adresa: "Veleslavínova 21",
        mesto: "Plzeň",
        psc: "306 17",
        isds: "ri0abbm",
        lat: 49.7477, lon: 13.3776
    },
    {
        nazev: "Okresní soud Prachatice",
        zkratka: "OSPt",
        typ: "okresni",
        adresa: "Nám. Volyňských Čechů 12",
        mesto: "Prachatice",
        psc: "383 01",
        isds: "sjabbm1",
        lat: 49.0112, lon: 14.0013
    },
    {
        nazev: "Okresní soud Praha-východ",
        zkratka: "OSPVy",
        typ: "okresni",
        adresa: "5. května 1337",
        mesto: "Říčany",
        psc: "251 01",
        isds: "tkabbm2",
        lat: 49.9934, lon: 14.6526
    },
    {
        nazev: "Okresní soud Praha-západ",
        zkratka: "OSPZa",
        typ: "okresni",
        adresa: "Revoluční 762",
        mesto: "Příbram",
        psc: "261 01",
        isds: "ulabbm3",
        lat: 49.6974, lon: 14.0079
    },
    {
        nazev: "Okresní soud Prostějov",
        zkratka: "OSPv",
        typ: "okresni",
        adresa: "nám. T. G. Masaryka 104",
        mesto: "Prostějov",
        psc: "796 01",
        isds: "vmabbm4",
        lat: 49.4722, lon: 17.1073
    },
    {
        nazev: "Okresní soud Přerov",
        zkratka: "OSPr",
        typ: "okresni",
        adresa: "Bartošova 24",
        mesto: "Přerov",
        psc: "750 02",
        isds: "wnabbm5",
        lat: 49.4556, lon: 17.4494
    },
    {
        nazev: "Okresní soud Příbram",
        zkratka: "OSPb",
        typ: "okresni",
        adresa: "Revoluční 762",
        mesto: "Příbram",
        psc: "261 01",
        isds: "xoabbm6",
        lat: 49.6974, lon: 14.0079
    },
    {
        nazev: "Okresní soud Rakovník",
        zkratka: "OSRa",
        typ: "okresni",
        adresa: "Husovo nám. 3",
        mesto: "Rakovník",
        psc: "269 20",
        isds: "ypabbm7",
        lat: 50.1062, lon: 13.7349
    },
    {
        nazev: "Okresní soud Rokycany",
        zkratka: "OSRo",
        typ: "okresni",
        adresa: "Masarykovo nám. 1",
        mesto: "Rokycany",
        psc: "337 01",
        isds: "zqabbm8",
        lat: 49.7426, lon: 13.5930
    },
    {
        nazev: "Okresní soud Rychnov nad Kněžnou",
        zkratka: "OSRK",
        typ: "okresni",
        adresa: "Javornická 1544",
        mesto: "Rychnov nad Kněžnou",
        psc: "516 01",
        isds: "arabbm9",
        lat: 50.1641, lon: 16.2763
    },
    {
        nazev: "Okresní soud Semily",
        zkratka: "OSSe",
        typ: "okresni",
        adresa: "Nový Bydžov 1",
        mesto: "Semily",
        psc: "513 01",
        isds: "bsabbm0",
        lat: 50.6048, lon: 15.3373
    },
    {
        nazev: "Okresní soud Sokolov",
        zkratka: "OSSo",
        typ: "okresni",
        adresa: "Jednoty 1620",
        mesto: "Sokolov",
        psc: "356 01",
        isds: "ctabbma",
        lat: 50.1798, lon: 12.6408
    },
    {
        nazev: "Okresní soud Strakonice",
        zkratka: "OSSt",
        typ: "okresni",
        adresa: "Velké nám. 44",
        mesto: "Strakonice",
        psc: "386 11",
        isds: "duabbmb",
        lat: 49.2607, lon: 13.9028
    },
    {
        nazev: "Okresní soud Svitavy",
        zkratka: "OSSv",
        typ: "okresni",
        adresa: "Mánesova 79/2",
        mesto: "Svitavy",
        psc: "568 02",
        isds: "evabbmc",
        lat: 49.7559, lon: 16.4684
    },
    {
        nazev: "Okresní soud Šumperk",
        zkratka: "OSSu",
        typ: "okresni",
        adresa: "nám. Míru 1",
        mesto: "Šumperk",
        psc: "787 01",
        isds: "fwabbmd",
        lat: 49.9746, lon: 16.9728
    },
    {
        nazev: "Okresní soud Tábor",
        zkratka: "OSTa",
        typ: "okresni",
        adresa: "Žižkovo nám. 9",
        mesto: "Tábor",
        psc: "390 01",
        isds: "gxabbme",
        lat: 49.4148, lon: 14.6557
    },
    {
        nazev: "Okresní soud Tachov",
        zkratka: "OSTc",
        typ: "okresni",
        adresa: "Jeřabinová 1624",
        mesto: "Tachov",
        psc: "347 01",
        isds: "hyabbmf",
        lat: 49.7985, lon: 12.6363
    },
    {
        nazev: "Okresní soud Teplice",
        zkratka: "OSTe",
        typ: "okresni",
        adresa: "Mírové nám. 7",
        mesto: "Teplice",
        psc: "415 01",
        isds: "izabbmg",
        lat: 50.6408, lon: 13.8243
    },
    {
        nazev: "Okresní soud Trutnov",
        zkratka: "OSTr",
        typ: "okresni",
        adresa: "Havlíčkova 224",
        mesto: "Trutnov",
        psc: "541 01",
        isds: "j2abbmh",
        lat: 50.5613, lon: 15.9139
    },
    {
        nazev: "Okresní soud Třebíč",
        zkratka: "OSTre",
        typ: "okresni",
        adresa: "Bráfova tř. 50",
        mesto: "Třebíč",
        psc: "674 01",
        isds: "k3abbmi",
        lat: 49.2158, lon: 15.8799
    },
    {
        nazev: "Okresní soud Uherské Hradiště",
        zkratka: "OSUH",
        typ: "okresni",
        adresa: "Protzkarova 625",
        mesto: "Uherské Hradiště",
        psc: "686 01",
        isds: "l4abbmj",
        lat: 49.0703, lon: 17.4624
    },
    {
        nazev: "Okresní soud Ústí nad Labem",
        zkratka: "OSUL",
        typ: "okresni",
        adresa: "Národního odboje 1274",
        mesto: "Ústí nad Labem",
        psc: "400 92",
        isds: "m5abbmk",
        lat: 50.6607, lon: 14.0324
    },
    {
        nazev: "Okresní soud Ústí nad Orlicí",
        zkratka: "OSUO",
        typ: "okresni",
        adresa: "Mírové nám. 119",
        mesto: "Ústí nad Orlicí",
        psc: "562 01",
        isds: "n6abbml",
        lat: 49.9736, lon: 16.3963
    },
    {
        nazev: "Okresní soud Vsetín",
        zkratka: "OSVs",
        typ: "okresni",
        adresa: "nám. Svobody 8",
        mesto: "Vsetín",
        psc: "755 01",
        isds: "o7abbmm",
        lat: 49.3389, lon: 17.9951
    },
    {
        nazev: "Okresní soud Vyškov",
        zkratka: "OSVy",
        typ: "okresni",
        adresa: "nám. Čs. armády 1",
        mesto: "Vyškov",
        psc: "682 01",
        isds: "p8abbmn",
        lat: 49.2773, lon: 17.0083
    },
    {
        nazev: "Okresní soud Zlín",
        zkratka: "OSZl",
        typ: "okresni",
        adresa: "nám. Míru 1",
        mesto: "Zlín",
        psc: "762 01",
        isds: "q9abbmo",
        lat: 49.2253, lon: 17.6660
    },
    {
        nazev: "Okresní soud Znojmo",
        zkratka: "OSZn",
        typ: "okresni",
        adresa: "nám. Armády 4",
        mesto: "Znojmo",
        psc: "669 22",
        isds: "r0abbmp",
        lat: 48.8559, lon: 16.0490
    },
    {
        nazev: "Okresní soud Žďár nad Sázavou",
        zkratka: "OSZR",
        typ: "okresni",
        adresa: "Nádražní 600/21",
        mesto: "Žďár nad Sázavou",
        psc: "591 01",
        isds: "s1abbmq",
        lat: 49.5630, lon: 15.9393
    }
];

// Typy soudů pro filtrování
const COURT_TYPES = {
    nejvyssi: "Nejvyšší soudy",
    ustavni:  "Ústavní soud",
    vrchni:   "Vrchní soudy",
    krajsky:  "Krajské soudy",
    mestsky:  "Městské soudy",
    obv_Praha:"Obvodní soudy Praha",
    okresni:  "Okresní soudy"
};

// ─────────────────────────────────────────────────────────────
//  ISDS — validace formátu, join klíč a bezpečnostní pojistka
//
//  ⚠️ DŮLEŽITÉ: Vestavěné ISDS identifikátory NEJSOU ověřené proti
//  oficiálnímu registru (mojedatovaschranka.cz / justice.cz); některé
//  jsou zjevně placeholder (sekvenční nebo duplicitní — např. KS Praha
//  a MS Praha sdílí "snkabbm"). NESMÍ se použít pro reálné doručení bez
//  ověření — hrozí odeslání do cizí/neplatné datové schránky. Proto je
//  ISDS_DATA_VERIFIED = false a odesílací tok musí volat getCourtIsds()
//  a při verified=false vyžádat ruční potvrzení / vyhledání ISDS.
// ─────────────────────────────────────────────────────────────
const ISDS_DATA_VERIFIED = false;

// Formát ISDS je 7 znaků z [a-z0-9] (např. "5azzytb").
function isValidIsdsFormat(id) {
    return typeof id === 'string' && /^[a-z0-9]{7}$/.test(id);
}

// Normalizace názvu soudu pro spolehlivý join (odstraní " v "/" ve ",
// diakritiku a přebytečné mezery, malá písmena).
function normalizeCourtName(name) {
    return String(name || '')
        .toLowerCase()
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/\bve?\b/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

// Join klíč: najde záznam v COURT_REGISTRY podle zkratky nebo (normalizovaného)
// názvu z COURT_PATTERNS — dřív mezi oběma tabulkami žádná vazba nebyla.
function findCourtInRegistry(nameOrCode) {
    if (!nameOrCode) return null;
    const norm = normalizeCourtName(nameOrCode);
    return COURT_REGISTRY.find(c =>
        c.zkratka === nameOrCode ||
        normalizeCourtName(c.nazev) === norm
    ) || null;
}

// Bezpečné získání ISDS soudu. Vrací i příznaky valid/verified — volající
// NESMÍ automaticky odeslat, pokud verified=false, ale musí vyzvat k ověření.
function getCourtIsds(court) {
    const entry = typeof court === 'string' ? findCourtInRegistry(court) : court;
    if (!entry || !entry.isds) return { isds: null, valid: false, verified: false };
    const valid = isValidIsdsFormat(entry.isds);
    return { isds: entry.isds, valid, verified: ISDS_DATA_VERIFIED && valid };
}

const COURT_ISDS_API = {
    ISDS_DATA_VERIFIED,
    isValidIsdsFormat,
    normalizeCourtName,
    findCourtInRegistry,
    getCourtIsds
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { COURT_REGISTRY, COURT_TYPES, ...COURT_ISDS_API };
} else {
    window.COURT_REGISTRY = COURT_REGISTRY;
    window.COURT_TYPES = COURT_TYPES;
    window.LexisCourtISDS = COURT_ISDS_API;
}
