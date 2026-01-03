const lineups = [
  // Monster smoke from CT
  {
    id: "monster_smoke_from_ct",
    target: "monster_smoke",
    name: "Monster",
    variant: "CT Spawn",
    type: "smoke",    // smoke | flash | molotov
	side: "CT",
    description: "Jumpthrow",
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
  // Monster molly
  {
    id: "monster_molly",
    name: "Monster",
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
  },
  // Short smoke from CT
  {
    id: "short_smoke_from_ct",
    name: "Short",
    type: "smoke",    // smoke | flash | molotov
	side: "CT",
    description: "Jumpthrow",
    x: 70, // <-- impact (point visible)
    y: 51,
	throw: { // <-- point de lancement
		x:50.9,
		y:13.8
	},
    images: {
      stand: "images/overpass/monster_from_ct_smoke_1.png",
      aim: "images/overpass/short_from_ct_smoke_2.png"
    }
  },
  // B site HOLD
  {
    id: "bsite_smoke",
    name: "B Site hold",
    type: "smoke",    // smoke | flash | molotov
	side: "CT",
    description: "Left click",
    x: 75.1, // <-- impact (point visible)
    y: 28.3,
	throw: { // <-- point de lancement
		x:75.8,
		y:23.2
	},
    images: {
      stand: "images/overpass/BSite_hold_smoke_1.png",
      aim: "images/overpass/BSite_hold_smoke_2.png"
    }
  },
  // Short molly
  {
    id: "short_molly",
    name: "Short",
    type: "molotov",    // smoke | flash | molotov
	side: "CT",
    description: "Left and Right click + Running",
    x: 68, // <-- impact (point visible)
    y: 51,
	throw: { // <-- point de lancement
		x:53.5,
		y:29.9
	},
    images: {
      stand: "images/overpass/short_molly_1.png",
      aim: "images/overpass/short_molly_2.png"
    }
  },
  // Bank smoke from banana
    {
    id: "bank_smoke",
    name: "Bank",
    type: "smoke",    // smoke | flash | molotov
	side: "T",
    description: "Jumpthrow",
    x: 44.3, // <-- impact (point visible)
    y: 10.8,
	throw: { // <-- point de lancement
		x:46.5,
		y:48.4
	},
    images: {
      stand: "images/overpass/a_exec.png",
      aim: "images/overpass/bank_smoke.png"
    }
  },
  // Trash smoke from banana
    {
    id: "trash_smoke",
    name: "Trash",
    type: "smoke",    // smoke | flash | molotov
	side: "T",
    description: "Jumpthrow",
    x: 53.9, // <-- impact (point visible)
    y: 13.8,
	throw: { // <-- point de lancement
		x:46.5,
		y:48.4
	},
    images: {
      stand: "images/overpass/a_exec.png",
      aim: "images/overpass/trash_smoke.png"
    }
  },
  // Truck molly from banana
    {
    id: "truck_molly",
    name: "Truck",
    type: "molotov",    // smoke | flash | molotov
	side: "T",
    description: "W Jumpthrow",
    x: 53.5, // <-- impact (point visible)
    y: 21.4,
	throw: { // <-- point de lancement
		x:46.5,
		y:48.4
	},
    images: {
      stand: "images/overpass/a_exec.png",
      aim: "images/overpass/truck_molly.png"
    }
  },
  // A flash from banana (1)
    {
    id: "a_flash_1",
    name: "Site first",
    type: "flash",    // smoke | flash | molotov
	side: "T",
    description: "Jumpthrow",
    x: 49.0, // <-- impact (point visible)
    y: 23.5,
	throw: { // <-- point de lancement
		x:47.8,
		y:44.4
	},
    images: {
      stand: "images/overpass/a_flash.png",
      aim: "images/overpass/a_flash_1.png"
    }
  },
  // A flash from banana (2)
    {
    id: "a_flash_2",
    name: "Site second",
    type: "flash",    // smoke | flash | molotov
	side: "T",
    description: "Jumpthrow",
    x: 51, // <-- impact (point visible)
    y: 24.7,
	throw: { // <-- point de lancement
		x:47.8,
		y:44.4
	},
    images: {
      stand: "images/overpass/a_flash.png",
      aim: "images/overpass/a_flash_2.png"
    }
  },
];




const executes = [
  {
    id: "A_exec_from_banana",
    name: "A Execute (banana)",
    items: ["bank_smoke", "trash_smoke", "truck_molly"]
  },
];


