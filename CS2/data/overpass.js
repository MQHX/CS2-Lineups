const lineups = [
  {
    id: "monster_from_ct",
    name: "Monster smoke",
    type: "smoke",    // smoke | flash | molotov
	side: "CT",
    description: "Left click+Jumpthrow",
    x: 80.8, // <-- impact (point visible)
    y: 44.6,
	throw: { // <-- point de lancement
		x:50.9,
		y:13.8
	},
    images: {
      stand: "images/overpass/monster_from_ct_1.png",
      aim: "images/overpass/monster_from_ct_2.png"
    }
  },
  {
    id: "flash_a",
    name: "Flash Site A",
    type: "flash",
	side: "CT",
    description: "Flash rapide pour entrer sur le site A.",
    x: 70,
    y: 30,
	throw: { // <-- point de lancement
		x:62.4,
		y:40.2
	},
    images: {
      stand: "images/overpass/flash_a_stand.png",
      aim: "images/overpass/flash_a_aim.png"
    }
  }
];


