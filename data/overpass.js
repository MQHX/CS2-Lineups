const lineups = [
  {
    id: "monster_smoke_from_ct",
    name: "Monster smoke",
    type: "smoke",    // smoke | flash | molotov
	side: "CT",
    description: "Left click + Jumpthrow",
    x: 80.9, // <-- impact (point visible)
    y: 44.6,
	throw: { // <-- point de lancement
		x:50.9,
		y:13.8
	},
    images: {
      stand: "images/overpass/monster_from_ct_smoke_1.png",
      aim: "images/overpass/monster_from_ct_smoke_2.png"
    }
  },
  {
    id: "monster_molly",
    name: "Monster Molly",
    type: "molotov",
	side: "CT",
    description: "Left click + Running",
    x: 80.9,
    y: 39.7,
	throw: { // <-- point de lancement
		x:70.9,
		y:26.5
	},
    images: {
      stand: "images/overpass/monster_molly_1.png",
      aim: "images/overpass/monster_molly_2.png"
    }
  }
];


