import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import {
  initSounds,
  initGlobalClickSound,
  tryStartMusic,
  restartThemeMusic
} from "./sound.js";
import { syncPublicLeaderboardEntry } from "./leaderboard-public.js";
import { saveStudyHistory } from "./study-history-store.js";
import { MODULE_CATALOG, MODULE_STRUCTURE } from "../data/module-data.js";

/* =========================
   FIREBASE CONFIG
========================= */
const firebaseConfig = {
  apiKey: "AIzaSyDZiVk1T6ZbpKJrhRt1wQAr2vSSn4Wa_KU",
  authDomain: "gamifiedlearningsystem.firebaseapp.com",
  projectId: "gamifiedlearningsystem",
  appId: "1:516998404507:web:0c625f9af2809ca4b6a93e"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
let currentUser = null;
let autoCheckpointObserver = null;
let autoCheckpointInFlight = false;
const MODULE_XP_REWARD = 5;
const QUICK_CHECK_XP_PER_CORRECT = 1;
const RECENT_MODULE_COMPLETION_KEY = "recent_module_completion";
let moduleImageBanksPromise = null;
let currentModuleGateState = {
  readBottom: false,
  quickCheckAttempted: false,
  completed: false
};

async function loadModuleImageBanks() {
  if (!moduleImageBanksPromise) {
    moduleImageBanksPromise = Promise.all([
      import("../data/module-images.js"),
      import("../data/module-supplemental-images.js")
    ]).then(([embeddedModule, supplementalModule]) => ({
      moduleImages: embeddedModule.MODULE_IMAGES || {},
      supplementalImages: supplementalModule.MODULE_SUPPLEMENTAL_IMAGES || {}
    }));
  }

  return moduleImageBanksPromise;
}

/* =========================
   AUTH CHECK
========================= */
onAuthStateChanged(auth, (user) => {
  const isGuest = localStorage.getItem("guest") === "true";
  currentUser = user || null;

  if (!user && !isGuest) {
    window.location.href = "auth.html";
  }
});

/* =========================
   PARAMETERS
========================= */
const params = new URLSearchParams(window.location.search);
const subject = params.get("subject") || "electrical";
const difficulty = params.get("difficulty") || "easy";
const moduleKey = params.get("module") || "module1";
const moduleNumber = Number(moduleKey.replace("module", "")) || 1;
const STATIC_MODULE_COUNT = MODULE_STRUCTURE?.[subject]?.[difficulty] || 0;
let publishedModules = [];
let totalModulesForDifficulty = STATIC_MODULE_COUNT;

const subjectNames = {
  electrical: "Electrical",
  hardware: "Computer Hardware"
};

const difficultyNames = {
  easy: "Easy",
  medium: "Medium",
  hard: "Difficult"
};

function getWeekKey(date = new Date()) {
  const utcDate = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = utcDate.getUTCDay() || 7;
  utcDate.setUTCDate(utcDate.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(utcDate.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((utcDate - yearStart) / 86400000) + 1) / 7);
  return `${utcDate.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

const LITERAL_IMAGE_CAPTIONS = {
  "assets/modules/hardware/easy/module1/image-01.png": "Sound card",
  "assets/modules/hardware/easy/module1/image-02.png": "Desktop microphone",
  "assets/modules/hardware/easy/module1/image-03.png": "LAN ports",
  "assets/modules/hardware/easy/module1/image-04.png": "Network interface card",
  "assets/modules/hardware/easy/module1/image-05.png": "Computer memory slots",
  "assets/modules/hardware/easy/module1/image-06.png": "CPU cooler",
  "assets/modules/hardware/easy/module1/image-07.png": "Ink tank printer",
  "assets/modules/hardware/easy/module1/image-08.png": "Computer cooling fan",
  "assets/modules/hardware/easy/module2/image-01.png": "Respirator mask and full-face respirator",
  "assets/modules/hardware/easy/module2/image-02.png": "Cleaning cloth",
  "assets/modules/hardware/easy/module2/image-03.png": "Anti-static wrist strap",
  "assets/modules/hardware/easy/module2/image-04.png": "Safety hard hat",
  "assets/modules/hardware/easy/module2/image-05.png": "Protective safety boots",
  "assets/modules/hardware/easy/module2/image-06.png": "Protective safety goggles",
  "assets/modules/hardware/easy/module2/image-07.png": "High-visibility safety vest",
  "assets/modules/hardware/easy/module2/image-08.png": "Parts organizer storage box",
  "assets/modules/hardware/easy/module2/image-09.png": "ESD-safe gloves for device handling",
  "assets/modules/hardware/easy/module2/image-10.png": "Anti-static work mat",
  "assets/modules/hardware/easy/module2/image-11.png": "Foam earplugs",
  "assets/modules/hardware/easy/module2/image-12.png": "Electronics compressed-air duster",
  "assets/modules/hardware/easy/module2/image-13.png": "Face shield visor",
  "assets/modules/hardware/easy/module2/image-14.png": "Anti-static bag",
  "assets/modules/hardware/easy/module2/image-15.png": "Cable ties",
  "assets/modules/hardware/easy/module2/image-16.png": "Protective work gloves",
  "assets/modules/hardware/easy/module2/image-17.png": "Safety harness with lanyard",
  "assets/modules/hardware/easy/module3/image-01.png": "Safety clothing and hazard icons",
  "assets/modules/hardware/easy/module3/image-02.png": "Complete PPE diagram",
  "assets/modules/hardware/easy/module3/image-03.png": "Laboratory safety rules poster",
  "assets/modules/hardware/easy/module3/image-04.png": "Safety and hazard symbols chart",
  "assets/modules/electrical/easy/module1/image-01.jpg": "Technician inspecting solar panels",
  "assets/modules/electrical/easy/module1/image-02.jpg": "Technician working on a server rack",
  "assets/modules/electrical/easy/module1/image-03.jpg": "Electrician installing ceiling wiring",
  "assets/modules/electrical/easy/module1/image-04.png": "High-visibility work coveralls",
  "assets/modules/electrical/easy/module1/image-05.jpg": "Yellow hard hat",
  "assets/modules/electrical/easy/module2/image-01.jpg": "High-visibility protective clothing",
  "assets/modules/electrical/easy/module2/image-02.jpg": "Yellow hard hat",
  "assets/modules/electrical/easy/module2/image-03.jpg": "Face shield helmet",
  "assets/modules/electrical/easy/module2/image-04.jpg": "Ear protection earmuffs",
  "assets/modules/electrical/easy/module2/image-05.jpg": "Electrical safety boots",
  "assets/modules/electrical/easy/module2/image-06.jpg": "Insulated protective gloves",
  "assets/modules/electrical/easy/module3/image-01.jpg": "Digital multimeter",
  "assets/modules/electrical/easy/module3/image-02.jpg": "Electrician's cable knife",
  "assets/modules/electrical/easy/module3/image-03.jpg": "Wire stripper",
  "assets/modules/electrical/easy/module3/image-04.jpg": "Clamp meter kit",
  "assets/modules/electrical/easy/module3/image-05.jpg": "Insulated screwdriver set",
  "assets/modules/electrical/easy/module3/image-06.jpg": "Crimping tool",
  "assets/modules/electrical/easy/module3/image-07.jpg": "Long nose pliers",
  "assets/modules/electrical/easy/module3/image-08.jpg": "Fish tape wire puller",
  "assets/modules/electrical/easy/module3/image-09.jpg": "Lineman pliers",
  "assets/modules/electrical/easy/module3/image-10.jpg": "Clamp meter",
  "assets/modules/electrical/medium/module2/image-01.jpg": "Direct current graph",
  "assets/modules/electrical/medium/module2/image-02.png": "Alternating current waveform",
  "assets/modules/electrical/medium/module2/image-03.jpg": "Direct current circuit example",
  "assets/modules/electrical/medium/module2/image-04.png": "DC and AC comparison diagram",
  "assets/modules/electrical/medium/module2/image-05.png": "Alternating current RLC circuit",
  "assets/modules/electrical/medium/module3/image-01.jpg": "THHN single-conductor wire",
  "assets/modules/electrical/medium/module3/image-02.jpg": "Coaxial cable",
  "assets/modules/electrical/medium/module3/image-03.jpg": "Shielded multi-core cable",
  "assets/modules/electrical/medium/module3/image-04.jpg": "MTW machine tool wire",
  "assets/modules/electrical/medium/module3/image-05.jpg": "UF underground feeder cable",
  "assets/modules/electrical/medium/module3/image-06.jpg": "Stranded copper wire",
  "assets/modules/electrical/medium/module3/image-07.png": "AWG ampacity reference table",
  "assets/modules/electrical/medium/module3/image-08.jpg": "PVC electrical conduit pipes",
  "assets/modules/electrical/medium/module3/image-09.jpg": "Twisted pair cable (UTP and STP)",
  "assets/modules/electrical/medium/module3/image-10.jpg": "Heat-shrink tubing assortment",
  "assets/modules/electrical/medium/module3/image-11.jpg": "Conductors in metal conduit",
  "assets/modules/electrical/medium/module3/image-12.jpg": "XHHW insulated wire samples",
  "assets/modules/electrical/medium/module3/image-13.jpg": "AWG wire size comparison",
  "assets/modules/electrical/medium/module3/image-14.jpg": "Fiber optic cable",
  "assets/modules/electrical/medium/module3/image-15.jpg": "Two-core flexible cable",
  "assets/modules/electrical/medium/module3/image-16.jpg": "Solid conductor gauge comparison",
  "assets/modules/electrical/medium/module3/image-17.jpg": "MC armored multi-core cable",
  "assets/modules/electrical/hard/module1/image-01.jpg": "Cable raceway channels",
  "assets/modules/electrical/hard/module1/image-02.jpg": "Inline wire connector",
  "assets/modules/electrical/hard/module1/image-03.png": "Parallel and series circuit comparison",
  "assets/modules/electrical/hard/module1/image-04.jpg": "Flexible metal conduit",
  "assets/modules/electrical/hard/module1/image-05.jpg": "Conduit junction box wiring",
  "assets/modules/electrical/hard/module1/image-06.jpg": "Wire stripping example",
  "assets/modules/electrical/hard/module1/image-07.jpg": "Multi-core cable in flexible conduit",
  "assets/modules/electrical/hard/module1/image-08.jpg": "Cable tray elbow section",
  "assets/modules/electrical/hard/module1/image-09.jpg": "Sheathed power cable",
  "assets/modules/electrical/hard/module1/image-10.jpg": "Series circuit lamp diagram",
  "assets/modules/electrical/hard/module1/image-11.jpg": "PVC conduit pipes",
  "assets/modules/electrical/hard/module1/image-12.jpg": "Compression splice connector",
  "assets/modules/electrical/hard/module1/image-13.jpg": "Wire splice methods",
  "assets/modules/electrical/hard/module1/image-14.jpg": "Conduit wiring conductor comparison",
  "assets/modules/electrical/hard/module1/image-15.jpg": "Parallel circuit lamp diagram",
  "assets/modules/electrical/hard/module2/image-01.jpg": "Hot air rework station",
  "assets/modules/electrical/hard/module2/image-02.jpg": "Soldering flux paste",
  "assets/modules/electrical/hard/module2/image-03.jpg": "Electrical work safety gear chart",
  "assets/modules/electrical/hard/module2/image-04.jpg": "Soldering iron stand with sponge",
  "assets/modules/electrical/hard/module2/image-05.jpg": "Helping hands magnifier stand",
  "assets/modules/electrical/hard/module2/image-06.jpg": "Digital soldering station",
  "assets/modules/electrical/hard/module2/image-07.jpg": "Solder wire spool",
  "assets/modules/electrical/hard/module2/image-08.jpg": "Soldering on a circuit board",
  "assets/modules/electrical/hard/module2/image-09.jpg": "Desoldering wick",
  "assets/modules/electrical/hard/module2/image-10.jpg": "Desoldering pump",
  "assets/modules/electrical/hard/module3/image-01.jpg": "Capacitor assortment",
  "assets/modules/electrical/hard/module3/image-02.jpg": "Film capacitor",
  "assets/modules/electrical/hard/module3/image-03.jpg": "Cement power resistors",
  "assets/modules/electrical/hard/module3/image-04.jpg": "Inductor types chart",
  "assets/modules/electrical/hard/module3/image-05.jpg": "Metal film resistors",
  "assets/modules/electrical/hard/module3/image-06.jpg": "Toroidal inductor",
  "assets/modules/electrical/hard/module3/image-07.jpg": "Carbon film resistor",
  "assets/modules/electrical/hard/module3/image-08.png": "SMD resistor",
  "assets/modules/electrical/hard/module3/image-09.jpg": "Passive components overview",
  "assets/modules/electrical/hard/module3/image-10.png": "Resistor color code chart",
  "assets/modules/electrical/hard/module3/image-11.jpg": "Rotary potentiometer",
  "assets/modules/electrical/hard/module3/image-12.jpg": "Iron-core inductor",
  "assets/modules/electrical/hard/module3/image-13.jpg": "Electrolytic capacitor",
  "assets/modules/electrical/hard/module3/image-14.jpg": "Mixed resistor assortment",
  "assets/modules/electrical/hard/module3/image-15.jpg": "Ceramic disc capacitor",
  "assets/modules/electrical/hard/module3/image-16.jpg": "Axial electrolytic capacitors",
  "assets/modules/electrical/hard/module3/image-17.jpg": "Air-core inductor",
  "assets/modules/electrical/hard/module3/image-18.jpg": "Ceramic capacitor",
  "assets/modules/electrical/hard/module4/image-01.jpg": "DIP integrated circuit",
  "assets/modules/electrical/hard/module4/image-02.jpg": "LED assortment",
  "assets/modules/electrical/hard/module4/image-03.jpg": "LM324 integrated circuit",
  "assets/modules/electrical/hard/module4/image-04.jpg": "Wall toggle switch",
  "assets/modules/electrical/hard/module4/image-05.jpg": "JST wire connectors",
  "assets/modules/electrical/hard/module4/image-06.jpg": "Transistor package assortment",
  "assets/modules/electrical/hard/module4/image-07.jpg": "Banana plug connectors",
  "assets/modules/electrical/hard/module4/image-08.png": "Toggle switch",
  "assets/modules/electrical/hard/module4/image-09.jpg": "Signal diode",
  "assets/modules/electrical/hard/module4/image-10.jpg": "DM741 integrated circuit",
  "assets/modules/electrical/hard/module4/image-11.jpg": "Diode assortment with LED",
  "assets/modules/electrical/hard/module4/image-12.jpg": "Screw terminal blocks",
  "assets/modules/electrical/hard/module4/image-13.jpg": "Semiconductor package assortment",
  "assets/modules/electrical/hard/module4/image-14.jpg": "NE555 timer IC"
};

const GAMIFIED_DETAILS = {
  "Introduction to Electricity and Electronics": {
    subtitle: "Beginner mission: understand where electricity comes from and how a simple circuit works.",
    objectives: [
      "Explain how electrons create electrical flow",
      "Identify the parts of an atom related to electricity",
      "Describe the source, path, and load in a simple circuit"
    ],
    sections: [
      { heading: "Energy in Motion", body: "Electricity is produced when electrons move through a conductor and create current." },
      { heading: "Atomic Building Blocks", body: "Protons, neutrons, and electrons explain how electrical charge exists and why electron movement matters." },
      { heading: "Closed Circuit Flow", body: "A circuit needs a source, a path, and a load. When the path is complete, current can move." }
    ],
    challenge: {
      title: "Circuit Starter Challenge",
      prompt: "Before moving on, prove that you understand the foundation of electricity.",
      points: [
        "Name the three atomic particles",
        "List the source, path, and load in a simple circuit",
        "Explain the difference between static and current electricity"
      ]
    }
  },
  "Personal Protective Equipment (PPE)": {
    subtitle: "Safety mission: identify the protection needed before touching electrical work.",
    objectives: [
      "Explain why PPE is essential in electrical work",
      "Match PPE items to the hazards they reduce",
      "Choose protection based on the task"
    ],
    sections: [
      { heading: "Why PPE Matters", body: "Electrical hazards are fast, invisible, and dangerous. PPE reduces injury risk and protects vital body areas." },
      { heading: "Core Protective Gear", body: "Insulated gloves, face shields, goggles, and rubber-soled boots help protect against shock, sparks, and debris." },
      { heading: "Task-Based Safety", body: "Different jobs require different protection, so PPE should match the environment and the electrical hazard." }
    ],
    challenge: {
      title: "PPE Loadout Check",
      prompt: "Imagine you will inspect exposed conductors and test a live circuit. What should be part of your safety loadout?",
      points: [
        "Choose at least three PPE items",
        "Explain what hazard each one helps prevent",
        "State why PPE should be prepared before the task begins"
      ]
    }
  },
  "Tools for Electrical Work": {
    subtitle: "Tool mission: learn the correct tool before attempting the task.",
    objectives: [
      "Identify the main tools used in electrical work",
      "Distinguish hand tools from measuring tools",
      "Explain why correct tool selection affects safety"
    ],
    sections: [
      { heading: "Hand Tools", body: "Insulated screwdrivers, pliers, and wire strippers are used to prepare, hold, tighten, and cut electrical connections." },
      { heading: "Measurement Tools", body: "Multimeters and clamp meters help test voltage, current, resistance, and other circuit conditions." },
      { heading: "Safe Tool Use", body: "The wrong tool can damage equipment or injure the user, so tool choice is part of safe electrical practice." }
    ],
    challenge: {
      title: "Tool Match Challenge",
      prompt: "Choose the correct tool for the job.",
      points: [
        "Pick the tool that removes insulation",
        "Pick the tool that measures voltage and resistance",
        "Pick the tool that grips wires in tight spaces"
      ],
      quiz: [
        {
          question: "Which tool removes insulation from a wire without damaging the conductor?",
          options: ["Wire stripper", "Clamp meter", "Lineman pliers", "Digital multimeter"],
          answer: "Wire stripper"
        },
        {
          question: "Which tool is used to measure voltage and resistance?",
          options: ["Long nose pliers", "Digital multimeter", "Fish tape wire puller", "Crimping tool"],
          answer: "Digital multimeter"
        },
        {
          question: "Which tool helps grip wires in tight spaces?",
          options: ["Long nose pliers", "Insulated screwdriver set", "Wire stripper", "Clamp meter"],
          answer: "Long nose pliers"
        }
      ]
    }
  },
  "Basic Electrical Quantities": {
    subtitle: "Core concepts mission: master the values that control every circuit.",
    objectives: [
      "Define voltage, current, resistance, and power",
      "Recall their units and symbols",
      "Identify the correct measuring tool for each quantity"
    ],
    sections: [
      { heading: "Voltage", body: "Voltage is the electrical pressure that pushes electrons through a circuit." },
      { heading: "Current and Resistance", body: "Current is electron flow, while resistance is the opposition to that flow." },
      { heading: "Power", body: "Power describes the rate at which electrical energy is used and is commonly represented by P = V x I." }
    ],
    challenge: {
      title: "Quantity Check",
      prompt: "Show that you can separate the four essential quantities.",
      points: [
        "Match voltage with volts",
        "Match current with amperes",
        "Explain how power relates to voltage and current"
      ],
      quiz: [
        {
          question: "Which unit is used to measure electrical current?",
          options: ["Volts", "Amperes", "Ohms", "Watts"],
          answer: "Amperes"
        },
        {
          question: "What quantity opposes the flow of electric charge in a circuit?",
          options: ["Voltage", "Resistance", "Power", "Frequency"],
          answer: "Resistance"
        },
        {
          question: "Which formula correctly represents electrical power?",
          options: ["P = V x I", "R = V + I", "I = P x R", "V = P + I"],
          answer: "P = V x I"
        }
      ]
    }
  },
  "Direct Current (DC) vs. Alternating Current (AC)": {
    subtitle: "Comparison mission: understand how electrical flow changes with the source.",
    objectives: [
      "Differentiate DC from AC",
      "Describe the direction of flow for each type",
      "Connect each current type to real systems"
    ],
    sections: [
      { heading: "Direct Current", body: "DC flows in one direction and is common in batteries, solar systems, and USB-powered devices." },
      { heading: "Alternating Current", body: "AC changes direction repeatedly and powers household outlets and larger electrical grids." },
      { heading: "Why It Matters", body: "Electrical devices and systems are designed around the type of current they receive and use." }
    ],
    challenge: {
      title: "Current Type Decision",
      prompt: "Decide whether each case uses DC or AC.",
      points: [
        "A wall outlet at home",
        "A battery-powered flashlight",
        "A USB charger"
      ],
      quiz: [
        {
          question: "Which type of current flows in one direction only?",
          options: ["DC", "AC", "Both DC and AC", "Neither"],
          answer: "DC"
        },
        {
          question: "Which source commonly provides AC power?",
          options: ["Battery", "Wall outlet", "USB charger", "Power bank"],
          answer: "Wall outlet"
        },
        {
          question: "Why is AC widely used in power distribution?",
          options: ["It can be easily transformed to different voltages", "It only works with LEDs", "It stores energy permanently", "It has no resistance"],
          answer: "It can be easily transformed to different voltages"
        }
      ]
    }
  },
  "Types of Wires and Cables": {
    subtitle: "Installation mission: recognize the right wire or cable for the environment.",
    objectives: [
      "Differentiate a wire from a cable",
      "Identify common electrical wiring types",
      "Match each type to a common application"
    ],
    sections: [
      { heading: "Wire vs. Cable", body: "A wire is a single conductor, while a cable groups multiple conductors inside protective sheathing." },
      { heading: "Common Types", body: "THHN, Romex, UF cable, and coaxial cable are used in different installation conditions." },
      { heading: "Application Fit", body: "Correct cable selection depends on heat, moisture, protection, and the place of installation." }
    ],
    challenge: {
      title: "Cable Selection Challenge",
      prompt: "Choose the best type for each situation.",
      points: [
        "Residential indoor wiring",
        "Underground outdoor installation",
        "Signal transmission with shielding"
      ],
      quiz: [
        {
          question: "What best describes a wire?",
          options: ["A single conductor", "A group of breakers", "A measuring device", "A grounding rod"],
          answer: "A single conductor"
        },
        {
          question: "Which cable type is commonly used for underground outdoor installation?",
          options: ["UF cable", "Romex only", "Coaxial only", "Speaker wire"],
          answer: "UF cable"
        },
        {
          question: "Which type is commonly associated with shielded signal transmission?",
          options: ["Coaxial cable", "Bare wire", "Fuse link", "Bus bar"],
          answer: "Coaxial cable"
        }
      ]
    }
  },
  "Wiring Methods": {
    subtitle: "Advanced mission: choose the safest wiring method for the environment.",
    objectives: [
      "Explain the purpose of wiring methods",
      "Recognize conduit, raceway, and cable tray systems",
      "Choose methods based on safety and environment"
    ],
    sections: [
      { heading: "Installation Context", body: "Wiring methods are selected based on environment, code requirements, protection level, and future accessibility." },
      { heading: "Common Methods", body: "Conduit, tray, and raceway systems each provide different forms of support and protection for conductors." },
      { heading: "Safety and Maintenance", body: "The chosen method affects both system protection and how easy the installation is to inspect or repair." }
    ],
    challenge: {
      title: "Wiring Route Challenge",
      prompt: "Think like an installer and choose the method that best fits the setting.",
      points: [
        "Industrial area with mechanical hazards",
        "Open route carrying grouped control cables",
        "Location needing easy maintenance access"
      ],
      quiz: [
        {
          question: "Which wiring method is suited to areas with mechanical hazards?",
          options: ["Conduit", "Loose cable only", "Open splice", "Bare conductor route"],
          answer: "Conduit"
        },
        {
          question: "Which setup is useful for grouped control cables on an open route?",
          options: ["Cable tray", "Loose extension cord", "Battery clip", "Fuse holder"],
          answer: "Cable tray"
        },
        {
          question: "Why does wiring method choice matter?",
          options: ["It affects protection and maintenance access", "It changes the color of electricity", "It replaces grounding", "It removes the need for testing"],
          answer: "It affects protection and maintenance access"
        }
      ]
    }
  },
  "Soldering and Desoldering Techniques": {
    subtitle: "Repair mission: build or remove electrical connections without damaging the circuit.",
    objectives: [
      "Define soldering and desoldering",
      "Identify the tools used in soldering work",
      "Explain why strong joints matter"
    ],
    sections: [
      { heading: "Soldering Basics", body: "Soldering joins metal parts by melting filler metal into the joint." },
      { heading: "Tools and Materials", body: "Soldering irons, solder, flux, helping hands, stands, and safety gear are part of a proper setup." },
      { heading: "Repair and Rework", body: "Desoldering is used to remove or correct electrical joints during repair and replacement work." }
    ],
    challenge: {
      title: "Bench Prep Challenge",
      prompt: "Before starting solder work, check if your setup is complete.",
      points: [
        "List the main soldering tools needed",
        "Explain why flux is useful",
        "State one safety practice for hot tools or fumes"
      ],
      quiz: [
        {
          question: "What is soldering used for?",
          options: ["Joining metal parts with filler metal", "Measuring current", "Removing insulation", "Cooling a processor"],
          answer: "Joining metal parts with filler metal"
        },
        {
          question: "Which material helps solder flow and clean the joint?",
          options: ["Flux", "Concrete", "Paint", "Grease only"],
          answer: "Flux"
        },
        {
          question: "What is desoldering used for?",
          options: ["Removing or correcting a joint", "Increasing voltage", "Bundling wires", "Testing continuity only"],
          answer: "Removing or correcting a joint"
        }
      ]
    }
  },
  "Passive Components": {
    subtitle: "Component mission: understand how circuits store, resist, and filter energy.",
    objectives: [
      "Identify common passive components",
      "Explain what each one does",
      "Connect each component to a practical circuit role"
    ],
    sections: [
      { heading: "Resistors", body: "Resistors limit or divide current and help control voltage and signal behavior." },
      { heading: "Capacitors", body: "Capacitors store and release electrical energy for timing, filtering, and smoothing." },
      { heading: "Inductors", body: "Inductors store energy in magnetic fields and are useful in filtering and power systems." }
    ],
    challenge: {
      title: "Passive Parts Check",
      prompt: "Separate the passive components by function.",
      points: [
        "Which component limits current?",
        "Which component stores electrical charge?",
        "Which component stores magnetic energy?"
      ],
      quiz: [
        {
          question: "Which passive component limits current?",
          options: ["Resistor", "Diode", "Transistor", "IC"],
          answer: "Resistor"
        },
        {
          question: "Which passive component stores electrical charge?",
          options: ["Capacitor", "Fuse", "Switch", "Relay"],
          answer: "Capacitor"
        },
        {
          question: "Which passive component stores energy in a magnetic field?",
          options: ["Inductor", "Capacitor", "LED", "Battery"],
          answer: "Inductor"
        }
      ]
    }
  },
  "Active Components": {
    subtitle: "Control mission: learn how circuits switch, guide, and amplify electrical flow.",
    objectives: [
      "Identify the main active components",
      "Explain how active parts differ from passive ones",
      "Recognize practical uses of diodes, transistors, and ICs"
    ],
    sections: [
      { heading: "Diodes", body: "Diodes guide current in one direction and help with rectification, protection, and LED output." },
      { heading: "Transistors", body: "Transistors act as switches or amplifiers in both digital and analog circuits." },
      { heading: "Integrated Circuits", body: "ICs combine many electronic functions in a compact package used across modern electronics." }
    ],
    challenge: {
      title: "Control Components Challenge",
      prompt: "Confirm that you can separate each active component by role.",
      points: [
        "Name the part that directs current one way",
        "Name the part that switches or amplifies",
        "Explain why ICs are important in modern electronics"
      ],
      quiz: [
        {
          question: "Which active component allows current mainly in one direction?",
          options: ["Diode", "Resistor", "Inductor", "Capacitor"],
          answer: "Diode"
        },
        {
          question: "Which active component commonly acts as a switch or amplifier?",
          options: ["Transistor", "Fuse", "Cable tie", "Coil only"],
          answer: "Transistor"
        },
        {
          question: "What does an IC provide?",
          options: ["Many electronic functions in one package", "A mechanical fastening point", "Only wire insulation", "A storage shelf"],
          answer: "Many electronic functions in one package"
        }
      ]
    }
  },
  "Parts of the Computer and Input Output Devices": {
    subtitle: "Starter mission: identify the major computer parts inside and outside the system unit.",
    objectives: [
      "Recognize the basic external computer parts",
      "Identify internal system components",
      "Explain the basic function of each part"
    ],
    sections: [
      { heading: "Input and Output Devices", body: "The monitor, keyboard, and mouse help the user receive output and send commands to the computer." },
      { heading: "Power and Protection", body: "The AVR helps protect the computer from unstable power and electrical damage." },
      { heading: "Internal Components", body: "PSU, HDD, RAM, ROM, BIOS, CMOS, and CPU each play a different role in storing data, powering the system, and processing instructions." }
    ],
    challenge: {
      title: "System Parts Challenge",
      prompt: "Test your understanding of the computer system layout.",
      points: [
        "Name one input device and one output device",
        "State the role of the CPU",
        "Explain why the AVR is important"
      ]
    }
  },
  "Safety Tools": {
    subtitle: "Protection mission: prepare the tools that keep the technician and components safe.",
    objectives: [
      "Identify PPE used in computer servicing",
      "Explain the purpose of ESD tools",
      "Separate technician protection from component protection"
    ],
    sections: [
      { heading: "Personal Protection", body: "Safety goggles, gloves, boots, masks, and face shields help protect the technician during servicing work." },
      { heading: "ESD Protection", body: "Anti-static wrist straps, mats, and gloves reduce static damage to sensitive components." },
      { heading: "Safe Work Habits", body: "Using the correct safety tools protects both the worker and the computer parts being handled." }
    ],
    challenge: {
      title: "Safety Tool Loadout",
      prompt: "Imagine you are about to open and repair a system unit. What should be ready?",
      points: [
        "Name one PPE item for the technician",
        "Name one ESD tool for the components",
        "Explain why static protection matters in computer servicing"
      ]
    }
  },
  OHS: {
    subtitle: "Behavior mission: apply safe habits in the lab and workplace.",
    objectives: [
      "Recognize safe lab and workplace procedures",
      "Identify common unsafe behaviors",
      "Apply OHS rules during technical work"
    ],
    sections: [
      { heading: "Safety Procedures", body: "Protective clothing, hazard awareness, and careful handling of tools and chemicals are essential in technical environments." },
      { heading: "Do's", body: "Keep the workplace clean, use tools correctly, check for hazards, and respect coworkers and lab rules." },
      { heading: "Don'ts", body: "Do not use tools without training, ignore safety guidelines, or leave dangerous objects or chemicals unattended." }
    ],
    challenge: {
      title: "OHS Habit Check",
      prompt: "Show that you can separate safe behavior from unsafe behavior.",
      points: [
        "Give one correct workplace habit",
        "Give one example of unsafe tool use",
        "Explain why cleanliness matters in technical work"
      ]
    }
  },
  Motherboard: {
    subtitle: "Architecture mission: understand the board that connects the whole computer.",
    objectives: [
      "Identify the literal parts found on a motherboard",
      "Explain the function of each major motherboard section",
      "Recognize how sockets, form factors, firmware, and cooling affect compatibility"
    ],
    sections: [
      {
        heading: "Literal Motherboard Parts",
        body: "The motherboard includes the CPU socket, chipset, DIMM or RAM slots, PCIe expansion slots, SATA ports, NVMe M.2 slots, VRM area, jumpers, DIP switches, BIOS or UEFI firmware chip, and CMOS battery. Each part has a specific place and purpose on the board."
      },
      {
        heading: "Sockets, Memory, and Expansion",
        body: "The CPU socket is the connection point for the processor. RAM slots hold system memory, while PCIe slots are used for graphics cards, sound cards, and network interface cards. Socket types such as LGA, PGA, and BGA determine whether a processor is physically compatible with the board."
      },
      {
        heading: "Storage, Firmware, and Power",
        body: "SATA ports connect hard drives and standard SSDs, while NVMe M.2 slots support faster storage. The BIOS or UEFI starts the hardware and runs POST, the CMOS battery preserves settings when power is off, and the VRM converts PSU power into the lower voltage needed by the CPU."
      },
      {
        heading: "Cooling and Form Factors",
        body: "CPU fans and heatsinks help remove excess heat during operation. Motherboard form factors such as ATX, E-ATX, Micro-ATX, and Mini-ITX determine the board's size, layout, case fit, and expansion capacity."
      }
    ],
    challenge: {
      title: "Motherboard Map Challenge",
      prompt: "Picture a real motherboard and identify the major parts by location and function.",
      points: [
        "Point out the CPU socket, RAM slots, PCIe slots, and storage interfaces",
        "Explain the role of the BIOS or UEFI, POST, and the CMOS battery",
        "Describe why the VRM, heatsink, and CPU fan matter during operation"
      ]
    }
  },
  "Basic Computer Configuration Setup": {
    subtitle: "Build mission: follow the source order for preparation, disassembly, assembly, and testing.",
    objectives: [
      "Identify the preparation and safety steps stated in the source",
      "Follow the disassembly and assembly order described in the module",
      "Recognize the post-assembly testing and troubleshooting checks listed in the source"
    ],
    sections: [
      {
        heading: "Preparation and Safety Protocols",
        body: "The source begins with workspace requirements, essential tools, power safety, and ESD protection. It states that the area should be large, level, well-lit, and well-ventilated, and that the power cord should be unplugged before touching internal components."
      },
      {
        heading: "Disassembly Procedures",
        body: "The source says disassembly should follow a logical reverse order. It includes shutting down the PC, allowing it to cool, unplugging external cables, removing side panels first, pulling components straight out, and organizing screws and small parts in labeled containers."
      },
      {
        heading: "Assembly and Component Installation",
        body: "The source covers motherboard mounting with standoffs, correct CPU alignment, thermal paste application, heatsink and fan installation, RAM alignment, PSU mounting, and proper front panel connector attachment."
      },
      {
        heading: "Post-Assembly Testing and Troubleshooting",
        body: "The source says the assembled system must undergo POST. It includes beep codes, no power, sudden shutdowns caused by CPU overheating, and missing storage that prevents the system from finding an operating system."
      }
    ],
    challenge: {
      title: "Build Sequence Challenge",
      prompt: "Recall the literal setup flow written in the source module.",
      points: [
        "State the preparation and safety actions before hardware work begins",
        "Describe the reverse order used during disassembly and the sequence used in assembly",
        "Name the POST and boot issues listed in the source"
      ]
    }
  },
  "Preventive Maintenance": {
    subtitle: "Reliability mission: follow the source steps that keep systems working before failure happens.",
    objectives: [
      "Explain preventive maintenance exactly as defined in the source",
      "Identify the hardware cleaning and checking practices listed in the module",
      "Recognize the safety and software maintenance steps described in the source"
    ],
    sections: [
      {
        heading: "Maintenance Planning and Procedures",
        body: "The source defines preventive maintenance as regular and systematic inspection, cleaning, and replacement of worn parts, materials, and systems. It says the first step is to review the job requirements and maintenance schedule, and it includes the 5S principle for workplace organization."
      },
      {
        heading: "Hardware Maintenance and Cleaning",
        body: "The source specifically includes compressed air for dust removal, correct RAM seating until the side tabs click, DDR keying and compatibility, and screw management using labeled containers or magnetic trays."
      },
      {
        heading: "Troubleshooting and Components",
        body: "The source includes thermal shutdown caused by CPU overheating, checking the 4/8-pin ATX 12V CPU power cable when there is no display, the role of the CMOS battery, and the definition of a MAC address on the LAN card."
      },
      {
        heading: "Safety and Software Maintenance",
        body: "The source says all power sources must be turned off and proper ESD protection must be used before maintenance. It also says a System Restore Point should be created before software maintenance such as registry cleaning or driver updates."
      }
    ],
    challenge: {
      title: "Maintenance Mindset Challenge",
      prompt: "Recall the preventive maintenance steps and checks written in the source module.",
      points: [
        "State why the maintenance schedule is reviewed first",
        "List the cleaning and checking practices named in the source",
        "Explain why ESD protection and a System Restore Point are included in the procedure"
      ]
    }
  },
  Troubleshooting: {
    subtitle: "Learn how to diagnose common computer hardware faults.",
    objectives: [
      "Explain the troubleshooting steps emphasized in the source",
      "Identify the literal hardware symptoms and causes listed in the module",
      "Classify faults and BIOS issues using the exact categories from the source"
    ],
    sections: [
      { heading: "1. The Troubleshooting Process", body: "While Preventive Maintenance is proactive (cleaning and updating to prevent issues), Troubleshooting is reactive (fixing an existing failure). Cisco defines a six-step process. The quiz emphasizes the first and most critical steps: Identify the Problem by always gathering system history and error symptoms first. Establish a Theory of Probable Cause by starting with the simplest issues, such as checking if the power cable is plugged into the outlet. Test the Theory by checking components like RAM using a known-working spare if a PC will not POST." },
      { heading: "2A. Power and Motherboard Issues", body: "Power Supply (PSU): If a PC restarts the moment a graphics-heavy app launches, the PSU wattage may be insufficient. Motherboard Failures: Bulging or leaking capacitors indicate a failing motherboard. If the system only boots outside the case, there is likely a short circuit due to improper grounding. VRM and Voltage: Burn marks near the VRM area or failing voltage regulators lead to inconsistent system stability under load." },
      { heading: "2B. CPU and Thermal Management", body: "Overheating: If the temperature rises too fast, check BIOS fan speeds or the thermal paste. A system that shuts down exactly 30 seconds after booting is usually hitting a thermal protection limit. Ventilation: In a lab, CPUs must be spaced apart to allow for proper airflow." },
      { heading: "2C. Memory (RAM) and Storage", body: "RAM Errors: Symptoms like Blue Screens (BSOD) or a memory count lower than what is installed suggest faulty or poorly seated RAM. Use a memory diagnostic utility to find cells that POST might miss. Storage (HDD/SSD): A \"No bootable device found\" message indicates a failed or disconnected drive. If installation takes a very long time, the drive likely has bad sectors. Cables: Frequent CRC errors usually point to a faulty SATA data cable rather than the drive itself." },
      { heading: "3. Classifying Faults", body: "Technicians must categorize errors to decide on a repair strategy. Transient Fault: A \"one-time\" error that does not recur if you try the operation again. Permanent Fault: An error that recurs every single time until the part is replaced (e.g., a dead NIC). Intermittent Fault: An error that happens randomly or produces different symptoms (like different beep codes) every time." },
      { heading: "4. BIOS and Firmware Issues", body: "CMOS/Clock: If the system clock loses time while the PC is running (not just off), the motherboard's crystal oscillator is likely failing. Corruption: Intermittent failure to detect boot devices can suggest BIOS corruption. Hardware ID: Replacing a motherboard often triggers OS activation issues because of a Hardware ID mismatch. Cisco Networking Academy. (2011). IT essentials: PC hardware and software companion guide (4th ed.). Cisco Press. https://ptgmedia.pearsoncmg.com/images/9781587132636/samplechapter/9781587132636_ch04.pdf" }
    ],
    challenge: {
      title: "Fault Hunt Challenge",
      prompt: "Use the source symptoms and classifications to reason like a technician.",
      points: [
        "State the first three troubleshooting steps emphasized in the lesson",
        "Match a symptom to PSU, motherboard, CPU, RAM, storage, or cable faults",
        "Explain the difference between transient, permanent, and intermittent faults"
      ]
    }
  },
  History: {
    subtitle: "Timeline mission: connect major inventors to the evolution of computing.",
    objectives: [
      "Identify major inventors in computer history",
      "Match each inventor to a key contribution",
      "Understand how early ideas shaped modern computing"
    ],
    sections: [
      { heading: "Foundations of Computing", body: "Charles Babbage and Ada Lovelace helped establish the earliest ideas of programmable machines and algorithmic thinking." },
      { heading: "Modern Computing Thinkers", body: "Alan Turing, John Von Neumann, Grace Hopper, and others shaped computation, architecture, and software development." },
      { heading: "Networking and the Web", body: "Tim Berners-Lee and Robert Metcalfe helped define the web and networking systems used today." }
    ],
    challenge: {
      title: "Inventor Match Challenge",
      prompt: "Review the timeline and link each person to the correct contribution.",
      points: [
        "Who designed the Analytical Engine?",
        "Who is associated with the World Wide Web?",
        "Who helped shape modern computer architecture?"
      ]
    }
  }
};

const CHALLENGE_QUIZZES = {
  "Introduction to Electricity and Electronics": [
    {
      question: "Which particle moves to create electrical flow in a conductor?",
      options: ["Electron", "Proton", "Neutron", "Nucleus"],
      answer: "Electron"
    },
    {
      question: "Which set completes a simple circuit?",
      options: ["Source, path, load", "Switch, motor, fan", "Wire, fuse, lamp", "Battery, resistor, atom"],
      answer: "Source, path, load"
    },
    {
      question: "Which type of electricity involves continuous movement of charge in a circuit?",
      options: ["Current electricity", "Static electricity", "Magnetic force", "Thermal power"],
      answer: "Current electricity"
    }
  ],
  "Personal Protective Equipment (PPE)": [
    {
      question: "Which PPE item protects the hands during electrical work?",
      options: ["Insulated gloves", "Earplugs", "Face towel", "Notebook"],
      answer: "Insulated gloves"
    },
    {
      question: "Which PPE item helps protect the eyes from sparks and debris?",
      options: ["Safety goggles", "Rubber mat", "Wire stripper", "Cable tie"],
      answer: "Safety goggles"
    },
    {
      question: "Why should PPE be prepared before starting the task?",
      options: ["To reduce injury risk before hazards are encountered", "To make the tools heavier", "To increase voltage", "To replace all safety rules"],
      answer: "To reduce injury risk before hazards are encountered"
    }
  ],
  "Tools for Electrical Work": [
    {
      question: "Which tool removes insulation from a wire without damaging the conductor?",
      options: ["Wire stripper", "Clamp meter", "Lineman pliers", "Digital multimeter"],
      answer: "Wire stripper"
    },
    {
      question: "Which tool is used to measure voltage and resistance?",
      options: ["Long nose pliers", "Digital multimeter", "Fish tape wire puller", "Crimping tool"],
      answer: "Digital multimeter"
    },
    {
      question: "Which tool helps grip wires in tight spaces?",
      options: ["Long nose pliers", "Insulated screwdriver set", "Wire stripper", "Clamp meter"],
      answer: "Long nose pliers"
    }
  ],
  "Basic Electrical Quantities": [
    {
      question: "What is the unit of voltage?",
      options: ["Volts", "Amperes", "Ohms", "Watts"],
      answer: "Volts"
    },
    {
      question: "Which quantity describes the flow of electric charge?",
      options: ["Current", "Resistance", "Power", "Frequency"],
      answer: "Current"
    },
    {
      question: "Which formula matches electrical power?",
      options: ["P = V x I", "R = V + I", "I = P x R", "V = P + I"],
      answer: "P = V x I"
    }
  ],
  "Direct Current (DC) vs. Alternating Current (AC)": [
    {
      question: "Which type of current flows in one direction only?",
      options: ["DC", "AC", "Both DC and AC", "Neither"],
      answer: "DC"
    },
    {
      question: "Which source commonly provides DC power?",
      options: ["Battery", "Wall outlet", "Distribution grid", "Transformer line"],
      answer: "Battery"
    },
    {
      question: "Which type of current is commonly delivered by household outlets?",
      options: ["AC", "DC", "Static", "Pulse only"],
      answer: "AC"
    }
  ],
  "Types of Wires and Cables": [
    {
      question: "What best describes a wire?",
      options: ["A single conductor", "A group of breakers", "A measuring device", "A grounding rod"],
      answer: "A single conductor"
    },
    {
      question: "Which cable type is commonly used for underground outdoor installation?",
      options: ["UF cable", "Romex only", "Coaxial only", "Speaker wire"],
      answer: "UF cable"
    },
    {
      question: "Which type is commonly associated with shielded signal transmission?",
      options: ["Coaxial cable", "Bare wire", "Fuse link", "Bus bar"],
      answer: "Coaxial cable"
    }
  ],
  "Wiring Methods": [
    {
      question: "Which wiring method is suited to areas with mechanical hazards?",
      options: ["Conduit", "Loose cable only", "Open splice", "Bare conductor route"],
      answer: "Conduit"
    },
    {
      question: "Which setup is useful for grouped control cables on an open route?",
      options: ["Cable tray", "Loose extension cord", "Battery clip", "Fuse holder"],
      answer: "Cable tray"
    },
    {
      question: "Why does wiring method choice matter?",
      options: ["It affects protection and maintenance access", "It changes the color of electricity", "It replaces grounding", "It removes the need for testing"],
      answer: "It affects protection and maintenance access"
    }
  ],
  "Soldering and Desoldering Techniques": [
    {
      question: "What is soldering used for?",
      options: ["Joining metal parts with filler metal", "Measuring current", "Removing insulation", "Cooling a processor"],
      answer: "Joining metal parts with filler metal"
    },
    {
      question: "Which material helps solder flow and clean the joint?",
      options: ["Flux", "Concrete", "Paint", "Grease only"],
      answer: "Flux"
    },
    {
      question: "What is desoldering used for?",
      options: ["Removing or correcting a joint", "Increasing voltage", "Bundling wires", "Testing continuity only"],
      answer: "Removing or correcting a joint"
    }
  ],
  "Passive Components": [
    {
      question: "Which passive component limits current?",
      options: ["Resistor", "Diode", "Transistor", "IC"],
      answer: "Resistor"
    },
    {
      question: "Which passive component stores electrical charge?",
      options: ["Capacitor", "Fuse", "Switch", "Relay"],
      answer: "Capacitor"
    },
    {
      question: "Which passive component stores energy in a magnetic field?",
      options: ["Inductor", "Capacitor", "LED", "Battery"],
      answer: "Inductor"
    }
  ],
  "Active Components": [
    {
      question: "Which active component allows current mainly in one direction?",
      options: ["Diode", "Resistor", "Inductor", "Capacitor"],
      answer: "Diode"
    },
    {
      question: "Which active component commonly acts as a switch or amplifier?",
      options: ["Transistor", "Fuse", "Cable tie", "Coil only"],
      answer: "Transistor"
    },
    {
      question: "What does an IC provide?",
      options: ["Many electronic functions in one package", "A mechanical fastening point", "Only wire insulation", "A storage shelf"],
      answer: "Many electronic functions in one package"
    }
  ],
  "Parts of the Computer and Input Output Devices": [
    {
      question: "Which of these is an input device?",
      options: ["Keyboard", "Monitor", "Speaker", "Printer"],
      answer: "Keyboard"
    },
    {
      question: "Which part processes instructions in the computer?",
      options: ["CPU", "AVR", "Monitor", "Mouse"],
      answer: "CPU"
    },
    {
      question: "Why is an AVR important?",
      options: ["It helps protect the computer from unstable power", "It stores photos", "It types text", "It replaces RAM"],
      answer: "It helps protect the computer from unstable power"
    }
  ],
  "Safety Tools": [
    {
      question: "Which item helps prevent electrostatic discharge while handling components?",
      options: ["Anti-static wrist strap", "Hammer", "Ruler", "Stapler"],
      answer: "Anti-static wrist strap"
    },
    {
      question: "Which item protects the eyes from dust and flying particles?",
      options: ["Safety goggles", "Notebook", "Cable tie", "USB drive"],
      answer: "Safety goggles"
    },
    {
      question: "What is a parts organizer used for?",
      options: ["Keeping screws and small parts sorted", "Measuring voltage", "Cutting wires", "Cooling the CPU"],
      answer: "Keeping screws and small parts sorted"
    }
  ],
  OHS: [
    {
      question: "Which is a correct OHS practice?",
      options: ["Keep the workplace clean and organized", "Leave tools on the floor", "Ignore hazard signs", "Use tools without training"],
      answer: "Keep the workplace clean and organized"
    },
    {
      question: "Which behavior is unsafe?",
      options: ["Ignoring safety guidelines", "Checking hazards before work", "Using PPE correctly", "Following lab rules"],
      answer: "Ignoring safety guidelines"
    },
    {
      question: "Why does cleanliness matter in technical work areas?",
      options: ["It helps reduce hazards and accidents", "It increases noise", "It replaces PPE", "It removes the need for supervision"],
      answer: "It helps reduce hazards and accidents"
    }
  ],
  Motherboard: [
    {
      question: "Which motherboard part holds the processor?",
      options: ["CPU socket", "SATA port", "PCIe slot", "CMOS battery"],
      answer: "CPU socket"
    },
    {
      question: "Which part stores BIOS settings when power is off?",
      options: ["CMOS battery", "VRM", "Heat sink", "Front panel header"],
      answer: "CMOS battery"
    },
    {
      question: "Which form factor is the most compact among the listed motherboard sizes?",
      options: ["Mini-ITX", "E-ATX", "ATX", "Micro-ATX is larger"],
      answer: "Mini-ITX"
    }
  ],
  "Basic Computer Configuration Setup": [
    {
      question: "What should be done before touching internal components?",
      options: ["Unplug the power cord", "Turn up the fan speed", "Remove the CPU first", "Install the OS immediately"],
      answer: "Unplug the power cord"
    },
    {
      question: "How should screws and small parts be handled during disassembly?",
      options: ["Keep them in labeled containers", "Scatter them on the table", "Throw them away", "Tape them to the monitor"],
      answer: "Keep them in labeled containers"
    },
    {
      question: "What must happen after assembly to verify startup behavior?",
      options: ["POST", "Wallpaper change", "Audio playback", "Keyboard cleaning"],
      answer: "POST"
    }
  ],
  "Preventive Maintenance": [
    {
      question: "What is preventive maintenance in the module?",
      options: ["Regular inspection, cleaning, and replacement of worn parts", "Only emergency repair", "Only software installation", "Only cable tying"],
      answer: "Regular inspection, cleaning, and replacement of worn parts"
    },
    {
      question: "What is commonly used to remove dust from hardware?",
      options: ["Compressed air", "Water spray", "Cooking oil", "Glue"],
      answer: "Compressed air"
    },
    {
      question: "What should be created before software maintenance such as driver updates?",
      options: ["A System Restore Point", "A new keyboard", "A second monitor", "A fan bracket"],
      answer: "A System Restore Point"
    }
  ],
  Troubleshooting: [
    {
      question: "What should be checked first when a PC has no power?",
      options: ["Outlet, cable, and PSU switch", "Speaker volume", "Screen wallpaper", "Mouse color"],
      answer: "Outlet, cable, and PSU switch"
    },
    {
      question: "What can beep codes and startup lights help identify?",
      options: ["Possible hardware faults", "Typing speed", "Internet plan", "Desk size"],
      answer: "Possible hardware faults"
    },
    {
      question: "Unexpected shutdowns and loud fans can point to what problem?",
      options: ["Overheating", "Printer ink level", "Loose wallpaper", "Keyboard language"],
      answer: "Overheating"
    }
  ],
  History: [
    {
      question: "Who is associated with the Analytical Engine concept?",
      options: ["Charles Babbage", "Tim Berners-Lee", "Robert Metcalfe", "Grace Hopper"],
      answer: "Charles Babbage"
    },
    {
      question: "Who strongly influenced compiler development?",
      options: ["Grace Hopper", "Konrad Zuse", "Alan Turing", "John von Neumann"],
      answer: "Grace Hopper"
    },
    {
      question: "Who created the World Wide Web?",
      options: ["Tim Berners-Lee", "Ada Lovelace", "Charles Babbage", "Robert Metcalfe"],
      answer: "Tim Berners-Lee"
    }
  ]
};

const IMAGE_CURATION = {
  "Introduction to Electricity and Electronics": {
    captionPrefix: "Electricity concept visual"
  },
  "Personal Protective Equipment (PPE)": {
    captionPrefix: "PPE reference"
  },
  "Tools for Electrical Work": {
    captionPrefix: "Electrical tool reference"
  },
  "Basic Electrical Quantities": {
    captionPrefix: "Electrical quantity visual"
  },
  "Direct Current (DC) vs. Alternating Current (AC)": {
    captionPrefix: "Current comparison visual"
  },
  "Types of Wires and Cables": {
    captionPrefix: "Wire and cable reference"
  },
  "Wiring Methods": {
    captionPrefix: "Wiring method example"
  },
  "Soldering and Desoldering Techniques": {
    captionPrefix: "Soldering technique visual"
  },
  "Passive Components": {
    captionPrefix: "Passive component reference"
  },
  "Active Components": {
    captionPrefix: "Active component reference"
  },
  "Parts of the Computer and Input Output Devices": {
    captionPrefix: "Computer parts visual"
  },
  "Safety Tools": {
    captionPrefix: "Safety tool reference"
  },
  OHS: {
    captionPrefix: "OHS reminder visual"
  },
  Motherboard: {
    captionPrefix: "Motherboard reference"
  },
  "Basic Computer Configuration Setup": {
    captionPrefix: "Configuration step visual"
  },
  "Preventive Maintenance": {
    captionPrefix: "Maintenance reference"
  },
  Troubleshooting: {
    captionPrefix: "Troubleshooting reference"
  },
  History: {
    captionPrefix: "Computer history reference"
  }
  ,
  Troubleshooting: {
    sections: [
      {
        heading: "The Troubleshooting Process",
        paragraphs: [
          "While Preventive Maintenance is proactive (cleaning and updating to prevent issues), Troubleshooting is reactive (fixing an existing failure).",
          "Cisco defines a six-step process. The lesson emphasizes the first and most critical steps: identify the problem by gathering system history and error symptoms first, establish a theory of probable cause by starting with the simplest issues such as checking if the power cable is plugged into the outlet, and test the theory by trying components like RAM using a known-working spare."
        ]
      },
      {
        heading: "Power, Motherboard, and Thermal Issues",
        paragraphs: [
          "Power Supply (PSU): If a PC restarts the moment a graphics-heavy app launches, the PSU wattage may be insufficient.",
          "Motherboard Failures: Bulging or leaking capacitors indicate a failing motherboard. If the system only boots outside the case, there is likely a short circuit due to improper grounding.",
          "VRM and Voltage: Burn marks near the VRM area or failing voltage regulators lead to inconsistent system stability under load.",
          "Overheating: If the temperature rises too fast, check BIOS fan speeds or the thermal paste. A system that shuts down exactly 30 seconds after booting is usually hitting a thermal protection limit.",
          "Ventilation: In a lab, CPUs must be spaced apart to allow for proper airflow."
        ]
      },
      {
        heading: "Memory (RAM) and Storage",
        paragraphs: [
          "RAM Errors: Symptoms like Blue Screens (BSOD) or a memory count lower than what is installed suggest faulty or poorly seated RAM. Use a memory diagnostic utility to find cells that POST might miss.",
          "Storage (HDD/SSD): A \"No bootable device found\" message indicates a failed or disconnected drive. If installation takes a very long time, the drive likely has bad sectors.",
          "Cables: Frequent CRC errors usually point to a faulty SATA data cable rather than the drive itself."
        ]
      },
      {
        heading: "Classifying Faults",
        paragraphs: [
          "Technicians must categorize errors to decide on a repair strategy.",
          "Transient Fault: A \"one-time\" error that does not recur if you try the operation again.",
          "Permanent Fault: An error that recurs every single time until the part is replaced (e.g., a dead NIC).",
          "Intermittent Fault: An error that happens randomly or produces different symptoms (like different beep codes) every time."
        ]
      },
      {
        heading: "BIOS and Firmware Issues",
        paragraphs: [
          "CMOS/Clock: If the system clock loses time while the PC is running (not just off), the motherboard's crystal oscillator is likely failing.",
          "Corruption: Intermittent failure to detect boot devices can suggest BIOS corruption.",
          "Hardware ID: Replacing a motherboard often triggers OS activation issues because of a Hardware ID mismatch.",
          "Cisco Networking Academy. (2011). IT essentials: PC hardware and software companion guide (4th ed.). Cisco Press. https://ptgmedia.pearsoncmg.com/images/9781587132636/samplechapter/9781587132636_ch04.pdf"
        ]
      }
    ],
    tables: []
  }
};

async function getModuleData() {
  if (moduleNumber > STATIC_MODULE_COUNT) {
    const publishedModule = publishedModules[moduleNumber - STATIC_MODULE_COUNT - 1] || null;
    if (!publishedModule) return null;

    const publishedImages = publishedModule.imageDataUrl
      ? [{ src: publishedModule.imageDataUrl, caption: "Published module image" }]
      : [];

    return {
      ...publishedModule,
      images: publishedImages
    };
  }

  const base = MODULE_CATALOG[subject]?.[difficulty]?.[moduleKey] || null;
  if (!base) return null;

  const { moduleImages, supplementalImages } = await loadModuleImageBanks();
  const embeddedImages = moduleImages?.[subject]?.[difficulty]?.[moduleKey] || [];
  const supplementalImageSet = supplementalImages?.[subject]?.[difficulty]?.[moduleKey] || [];

  return {
    ...base,
    images: curateModuleImages(
      base.title,
      [...embeddedImages, ...supplementalImageSet, ...(base.images || [])]
    )
  };
}

async function loadPublishedModuleEntries() {
  publishedModules = [];
  totalModulesForDifficulty = STATIC_MODULE_COUNT + publishedModules.length;
}

function getModuleDoneKey() {
  return `${subject}_${difficulty}_module_${moduleNumber}_done`;
}

function getModuleXPKey() {
  return `${getModuleDoneKey()}_xp_awarded`;
}

function getModuleReadKey() {
  return `${getModuleDoneKey()}_read_bottom`;
}

function getQuickCheckAttemptKey() {
  return `${getModuleDoneKey()}_quick_check_attempted`;
}

function getQuickCheckBestScoreKey() {
  return `${getModuleDoneKey()}_quick_check_best_score`;
}

async function ensureUserDoc(uid) {
  const userRef = doc(db, "users", uid);
  const snap = await getDoc(userRef);

  if (!snap.exists()) {
    await setDoc(userRef, {
      xp: 0,
      xpWeekly: 0,
      xpChange: 0,
      lastWeeklyReset: getWeekKey(),
      progress: {},
      results: {},
      createdAt: new Date().toISOString()
    });
  }

  return userRef;
}

async function isModuleCompleted() {
  const localDone = localStorage.getItem(getModuleDoneKey()) === "true";
  if (localDone) return true;
  if (!currentUser) return localDone;

  const userRef = await ensureUserDoc(currentUser.uid);
  const snap = await getDoc(userRef);
  const data = snap.data() || {};
  return data.progress?.[getModuleDoneKey()] === true || localDone;
}

async function hasReachedModuleBottom() {
  const localRead = localStorage.getItem(getModuleReadKey()) === "true";
  if (localRead) return true;
  if (!currentUser) return localRead;

  const userRef = await ensureUserDoc(currentUser.uid);
  const snap = await getDoc(userRef);
  const data = snap.data() || {};
  return data.progress?.[getModuleReadKey()] === true || localRead;
}

async function hasQuickCheckAttempted() {
  const localAttempted = localStorage.getItem(getQuickCheckAttemptKey()) === "true";
  if (localAttempted) return true;
  if (!currentUser) return localAttempted;

  const userRef = await ensureUserDoc(currentUser.uid);
  const snap = await getDoc(userRef);
  const data = snap.data() || {};
  return data.progress?.[getQuickCheckAttemptKey()] === true || localAttempted;
}

async function markModuleReadBottom() {
  localStorage.setItem(getModuleReadKey(), "true");

  if (!currentUser) return;

  const userRef = await ensureUserDoc(currentUser.uid);
  const snap = await getDoc(userRef);
  const data = snap.data() || {};
  const progress = data.progress || {};
  progress[getModuleReadKey()] = true;
  await updateDoc(userRef, { progress });
}

async function markQuickCheckAttempted() {
  localStorage.setItem(getQuickCheckAttemptKey(), "true");

  if (!currentUser) return;

  const userRef = await ensureUserDoc(currentUser.uid);
  const snap = await getDoc(userRef);
  const data = snap.data() || {};
  const progress = data.progress || {};
  progress[getQuickCheckAttemptKey()] = true;
  await updateDoc(userRef, { progress });
}

async function getModuleGateState() {
  const [readBottom, quickCheckAttempted, completed] = await Promise.all([
    hasReachedModuleBottom(),
    hasQuickCheckAttempted(),
    isModuleCompleted()
  ]);

  return {
    readBottom,
    quickCheckAttempted,
    completed
  };
}

async function markModuleCompleted() {
  const moduleData = await getModuleData();
  localStorage.setItem(getModuleDoneKey(), "true");
  localStorage.setItem(RECENT_MODULE_COMPLETION_KEY, JSON.stringify({
    subject,
    difficulty,
    module: moduleNumber,
    title: moduleData?.title || `Module ${moduleNumber}`,
    xp: MODULE_XP_REWARD,
    completedAt: new Date().toISOString()
  }));

  if (!currentUser) return;

  const userRef = await ensureUserDoc(currentUser.uid);
  const snap = await getDoc(userRef);
  const data = snap.data() || {};
  const progress = data.progress || {};
  progress[getModuleDoneKey()] = true;

  await updateDoc(userRef, { progress });
}

async function hasModuleXPAwarded() {
  const localAwarded = localStorage.getItem(getModuleXPKey()) === "true";
  if (localAwarded) return true;
  if (!currentUser) return false;

  const userRef = await ensureUserDoc(currentUser.uid);
  const snap = await getDoc(userRef);
  const data = snap.data() || {};
  return data.progress?.[getModuleXPKey()] === true || localAwarded;
}

async function awardModuleXPOnce() {
  const alreadyAwarded = await hasModuleXPAwarded();
  if (alreadyAwarded) {
    return 0;
  }

  localStorage.setItem(getModuleXPKey(), "true");

  if (currentUser) {
    const userRef = await ensureUserDoc(currentUser.uid);
    const snap = await getDoc(userRef);
    const data = snap.data() || {};
    const currentWeek = getWeekKey();
    const lastWeeklyReset = data.lastWeeklyReset || currentWeek;
    const currentXP = Number(data.xp || 0);
    const currentWeeklyXP =
      lastWeeklyReset === currentWeek ? Number(data.xpWeekly || 0) : 0;
    const progress = data.progress || {};

    progress[getModuleXPKey()] = true;

    await updateDoc(userRef, {
      xp: currentXP + MODULE_XP_REWARD,
      xpWeekly: currentWeeklyXP + MODULE_XP_REWARD,
      xpChange: MODULE_XP_REWARD,
      lastWeeklyReset: currentWeek,
      progress
    });

    await syncPublicLeaderboardEntry(db, currentUser.uid, {
      name: data.name || currentUser.displayName || currentUser.email || "User",
      photo: data.photo || currentUser.photoURL || "https://i.pravatar.cc/40?img=12",
      xp: currentXP + MODULE_XP_REWARD,
      xpWeekly: currentWeeklyXP + MODULE_XP_REWARD,
      xpChange: MODULE_XP_REWARD
    });
    return MODULE_XP_REWARD;
  }

  const guestXP = parseInt(localStorage.getItem("guest_xp") || "0", 10);
  const guestWeeklyXP = parseInt(localStorage.getItem("guest_xpWeekly") || "0", 10);
  localStorage.setItem("guest_xp", String(guestXP + MODULE_XP_REWARD));
  localStorage.setItem("guest_xpWeekly", String(guestWeeklyXP + MODULE_XP_REWARD));
  return MODULE_XP_REWARD;
}

async function getQuickCheckBestScore() {
  const localBest = parseInt(localStorage.getItem(getQuickCheckBestScoreKey()) || "0", 10);
  if (!currentUser) {
    return localBest;
  }

  const userRef = await ensureUserDoc(currentUser.uid);
  const snap = await getDoc(userRef);
  const data = snap.data() || {};
  const remoteBest = Number(data.progress?.[getQuickCheckBestScoreKey()] || 0);
  return Math.max(localBest, remoteBest);
}

async function awardQuickCheckXP(score) {
  const earnedScore = Math.max(0, Number(score) || 0);
  const bestScore = await getQuickCheckBestScore();
  const delta = Math.max(0, earnedScore - bestScore);

  if (delta <= 0) {
    return 0;
  }

  localStorage.setItem(getQuickCheckBestScoreKey(), String(earnedScore));

  if (currentUser) {
    const userRef = await ensureUserDoc(currentUser.uid);
    const snap = await getDoc(userRef);
    const data = snap.data() || {};
    const currentWeek = getWeekKey();
    const lastWeeklyReset = data.lastWeeklyReset || currentWeek;
    const currentXP = Number(data.xp || 0);
    const currentWeeklyXP =
      lastWeeklyReset === currentWeek ? Number(data.xpWeekly || 0) : 0;
    const progress = data.progress || {};

    progress[getQuickCheckBestScoreKey()] = earnedScore;

    await updateDoc(userRef, {
      xp: currentXP + delta,
      xpWeekly: currentWeeklyXP + delta,
      xpChange: delta,
      lastWeeklyReset: currentWeek,
      progress
    });

    await syncPublicLeaderboardEntry(db, currentUser.uid, {
      name: data.name || currentUser.displayName || currentUser.email || "User",
      photo: data.photo || currentUser.photoURL || "https://i.pravatar.cc/40?img=12",
      xp: currentXP + delta,
      xpWeekly: currentWeeklyXP + delta,
      xpChange: delta
    });

    return delta;
  }

  const guestXP = parseInt(localStorage.getItem("guest_xp") || "0", 10);
  const guestWeeklyXP = parseInt(localStorage.getItem("guest_xpWeekly") || "0", 10);
  localStorage.setItem("guest_xp", String(guestXP + delta));
  localStorage.setItem("guest_xpWeekly", String(guestWeeklyXP + delta));
  return delta;
}

function disconnectAutoCheckpointObserver() {
  if (autoCheckpointObserver) {
    autoCheckpointObserver.disconnect();
    autoCheckpointObserver = null;
  }
}

function updateModuleActionState(gateState = currentModuleGateState) {
  const actionBtn = document.getElementById("moduleActionBtn");
  if (!actionBtn) return;

  if (gateState.completed) {
    actionBtn.disabled = false;
    actionBtn.textContent =
      moduleNumber < totalModulesForDifficulty ? "Next Module" : "Return to Modules";
    return;
  }

  actionBtn.disabled = true;

  if (!gateState.readBottom) {
    actionBtn.textContent = "Scroll to Bottom First";
    return;
  }

  if (!gateState.quickCheckAttempted) {
    actionBtn.textContent = "Complete Quick Check";
    return;
  }

  actionBtn.textContent = "Finalizing Module...";
}

function updateCheckpointUi(completed, statusLabel = null, gateState = currentModuleGateState) {
  const progressState = document.getElementById("moduleProgressState");
  const checkpointBtn = document.getElementById("moduleCheckpointBtn");
  const statusChip = document.getElementById("moduleStatusChip");

  if (progressState) {
    progressState.textContent = completed ? "Cleared" : "In Progress";
  }

  if (checkpointBtn) {
    checkpointBtn.textContent = completed
      ? "Checkpoint cleared"
      : !gateState.readBottom
        ? "Scroll to the bottom to unlock the checkpoint"
        : !gateState.quickCheckAttempted
          ? "Bottom reached • complete the Quick Check"
          : "Checkpoint ready to finalize";
    checkpointBtn.disabled = true;
  }

  if (statusChip) {
    if (statusLabel) {
      statusChip.textContent = statusLabel;
    } else if (completed) {
      statusChip.textContent = "Checkpoint cleared";
    } else if (!gateState.readBottom) {
      statusChip.textContent = "Read to the bottom first";
    } else if (!gateState.quickCheckAttempted) {
      statusChip.textContent = "Quick Check required";
    } else {
      statusChip.textContent = "Ready to finalize";
    }
  }

  updateModuleActionState(gateState);
}

async function maybeAutoCompleteModule() {
  if (autoCheckpointInFlight) return;

  const gateState = await getModuleGateState();
  currentModuleGateState = gateState;

  if (gateState.completed) {
    updateCheckpointUi(true, "Checkpoint cleared", gateState);
    disconnectAutoCheckpointObserver();
    return;
  }

  if (!gateState.readBottom || !gateState.quickCheckAttempted) {
    updateCheckpointUi(false, null, gateState);
    return;
  }

  autoCheckpointInFlight = true;

  try {
    await markModuleCompleted();
    const earnedXP = await awardModuleXPOnce();
    currentModuleGateState = {
      readBottom: true,
      quickCheckAttempted: true,
      completed: true
    };
    updateCheckpointUi(
      true,
      earnedXP > 0 ? `Checkpoint cleared +${earnedXP} XP` : "Checkpoint cleared",
      currentModuleGateState
    );
    disconnectAutoCheckpointObserver();
  } finally {
    autoCheckpointInFlight = false;
  }
}

function setupAutoCheckpoint(data, completed) {
  disconnectAutoCheckpointObserver();

  if (!data || completed) {
    return;
  }

  const target = document.querySelector(".module-challenge");
  if (!target) {
    return;
  }

  autoCheckpointObserver = new IntersectionObserver(
    async (entries) => {
      const shouldComplete = entries.some(
        (entry) => entry.isIntersecting && entry.intersectionRatio >= 0.6
      );

      if (!shouldComplete) {
        return;
      }

      disconnectAutoCheckpointObserver();
      await markModuleReadBottom();
      currentModuleGateState = {
        ...currentModuleGateState,
        readBottom: true
      };
      await maybeAutoCompleteModule();
    },
    {
      threshold: [0.6]
    }
  );

  autoCheckpointObserver.observe(target);
}

function getImageInfo(moduleTitle, caption, index) {
  const literalInfo = {
    "Sound card": "A sound card handles audio input and output so a computer can play, record, and process sound.",
    "Desktop microphone": "A microphone is an input device used to capture voice and other audio signals.",
    "LAN ports": "LAN ports connect the computer to a local area network using an Ethernet cable.",
    "Network interface card": "A network interface card gives a computer wired network communication capability.",
    "Computer memory slots": "Memory slots hold RAM modules that provide temporary working memory for the system.",
    "CPU cooler": "A CPU cooler removes heat from the processor to help prevent overheating.",
    "Ink tank printer": "A printer is an output device that produces hard copies of digital documents and images.",
    "Computer cooling fan": "A cooling fan keeps air moving inside the system unit to reduce heat buildup.",
    "Respirator mask and full-face respirator": "These protective devices help block dust, fumes, and airborne particles during servicing work.",
    "Cleaning cloth": "A soft cleaning cloth is used to wipe components and surfaces without causing scratches.",
    "Anti-static wrist strap": "An anti-static wrist strap helps prevent electrostatic discharge that can damage sensitive components.",
    "Safety hard hat": "A hard hat protects the head from impact and falling objects in work areas.",
    "Protective safety boots": "Safety boots help protect the feet from impact, sharp objects, and slippery surfaces.",
    "Protective safety goggles": "Safety goggles shield the eyes from dust, flying particles, and accidental splashes.",
    "High-visibility safety vest": "A high-visibility vest makes the technician easier to see in active work areas and shared spaces.",
    "Parts organizer storage box": "A parts organizer keeps screws, jumpers, and small components sorted so they are not lost during servicing.",
    "ESD-safe gloves for device handling": "These gloves help the technician handle delicate devices more safely while reducing dirt, fingerprints, and minor static risk.",
    "Anti-static work mat": "An anti-static mat provides a safer work surface for servicing electronic parts that are sensitive to electrostatic discharge.",
    "Foam earplugs": "Foam earplugs protect hearing in noisy work areas where tools, machinery, or testing equipment are running.",
    "Electronics compressed-air duster": "A compressed-air duster is used to blow dust and lint out of computer parts without direct contact.",
    "Face shield visor": "A face shield helps protect the eyes and face from flying debris, dust, and accidental splashes.",
    "Anti-static bag": "An anti-static bag protects electronic components from electrostatic discharge during storage or transport.",
    "Cable ties": "Cable ties are used to bundle and organize wires so the workspace stays neat and cable routing stays controlled.",
    "Protective work gloves": "Protective work gloves help shield the hands from abrasion, sharp edges, and light handling hazards.",
    "Safety harness with lanyard": "A safety harness with lanyard is used for fall protection when work is done at height or in elevated areas.",
    "Safety clothing and hazard icons": "This visual highlights protective clothing and common workplace hazard warnings.",
    "Complete PPE diagram": "This diagram shows the full set of personal protective equipment that should be worn in a hazardous work area.",
    "Laboratory safety rules poster": "This poster summarizes the basic rules that keep laboratory and workshop activities safe.",
    "Safety and hazard symbols chart": "These symbols help learners quickly recognize hazards, required equipment, and emergency locations.",
    "Technician inspecting solar panels": "This image shows electrical work in a real installation setting where inspection and testing are important.",
    "Technician working on a server rack": "This visual shows a technician handling powered equipment and cable systems in a controlled environment.",
    "Electrician installing ceiling wiring": "This image shows an electrician routing conductors during installation work.",
    "High-visibility work coveralls": "High-visibility clothing helps make workers easier to see in active work areas.",
    "Yellow hard hat": "A hard hat is basic head protection used in construction and electrical work areas.",
    "High-visibility protective clothing": "High-visibility protective clothing helps make electrical workers easier to see while also adding basic body protection in active work areas.",
    "Yellow hard hat": "A hard hat protects the head from impact and falling objects in electrical and construction work areas.",
    "Face shield helmet": "A face shield helmet helps protect the eyes and face from sparks, flying particles, and accidental splashes during electrical work.",
    "Ear protection earmuffs": "Earmuffs protect hearing in noisy environments where machinery or tools are operating.",
    "Electrical safety boots": "Electrical safety boots add foot protection and help reduce risk while working near electrical hazards.",
    "Insulated protective gloves": "Insulated protective gloves help shield the hands while handling tools, wires, and equipment in electrical work.",
    "Digital multimeter": "A digital multimeter is used to measure voltage, current, resistance, and continuity.",
    "Electrician's cable knife": "A cable knife is used to cut and prepare insulation during electrical installation work.",
    "Wire stripper": "A wire stripper removes insulation cleanly without damaging the conductor inside.",
    "Clamp meter kit": "This clamp meter kit includes the measuring device and accessories used for electrical testing and inspection.",
    "Lineman pliers": "Lineman pliers are used for gripping, twisting, and cutting electrical wire.",
    "Clamp meter": "A clamp meter measures electrical current without needing to disconnect the conductor.",
    "Insulated screwdriver set": "Insulated screwdrivers are designed for electrical tasks where added shock protection is needed.",
    "Crimping tool": "A crimping tool secures terminals or connectors onto the ends of wires.",
    "Long nose pliers": "Long nose pliers are useful for gripping, bending, and reaching into tight spaces.",
    "Fish tape wire puller": "Fish tape helps guide and pull wires through conduit or enclosed paths.",
    "Direct current graph": "This graph shows direct current as a steady flow that keeps the same direction over time.",
    "Alternating current waveform": "This waveform shows alternating current rising and falling as it repeatedly changes direction over time.",
    "Direct current circuit example": "This circuit example shows direct current flowing in one direction from the source through the load.",
    "DC and AC comparison diagram": "This diagram compares direct current, which flows one way, with alternating current, which reverses direction.",
    "Alternating current RLC circuit": "This diagram shows an AC circuit with resistor, inductor, and capacitor components responding to a sinusoidal source.",
    "THHN single-conductor wire": "THHN is a single conductor wire with heat-resistant insulation and a nylon coating. It is commonly pulled through conduit in commercial and industrial buildings.",
    "Coaxial cable": "Coaxial cable uses a single inner conductor, insulation, shielding, and an outer jacket. It is commonly used for cable television, antennas, and internet modems.",
    "Shielded multi-core cable": "This shielded multi-core cable groups several insulated conductors inside one jacket and adds shielding to reduce interference in communication or control wiring.",
    "MTW machine tool wire": "MTW machine tool wire is a flexible single conductor that is heat- and oil-resistant. It is commonly used in machines, control panels, and appliance wiring.",
    "UF underground feeder cable": "UF cable is similar to Romex but is rated for underground use. Its outer sheath resists moisture, soil, and sunlight for outdoor installations.",
    "Stranded copper wire": "Stranded copper wire is made of many fine strands, making it more flexible than solid wire and easier to route in equipment or movable connections.",
    "AWG ampacity reference table": "This table relates AWG wire sizes to current capacity so students can match conductor thickness with a safe electrical load.",
    "PVC electrical conduit pipes": "These conduit pipes protect wires from damage and help route conductors through an installation.",
    "Twisted pair cable (UTP and STP)": "Twisted pair cable uses paired conductors to reduce interference. UTP and STP are widely used for Ethernet, telephones, and data transmission.",
    "Heat-shrink tubing assortment": "Heat-shrink tubing is used to insulate, cover, and protect electrical connections after installation.",
    "Conductors in metal conduit": "This image shows conductors installed inside metal conduit, a method commonly used where extra mechanical protection is required.",
    "XHHW insulated wire samples": "XHHW wire uses durable insulation suitable for wet or dry locations and is often used in industrial installations.",
    "AWG wire size comparison": "This chart compares wire gauge sizes to show how conductor thickness changes from one AWG value to another.",
    "Fiber optic cable": "Fiber optic cable uses glass or plastic fibers to transmit light signals and is used for high-speed data and telecommunication systems.",
    "Two-core flexible cable": "This flexible cable contains two conductors inside one outer jacket for portable or light-duty connections.",
    "Solid conductor gauge comparison": "This comparison shows how solid conductors vary in thickness across different wire gauge sizes for different current needs.",
    "MC armored multi-core cable": "MC or armored cable encloses multiple conductors inside a protective metal sheath and is commonly used in exposed commercial runs or retrofit work.",
    "Cable raceway channels": "These raceway channels are used to organize and protect conductors along structured wiring paths.",
    "Inline wire connector": "This inline connector joins conductors in a wiring run while keeping the connection enclosed.",
    "Parallel and series circuit comparison": "This diagram compares parallel and series circuit layouts to show how current paths differ.",
    "Flexible metal conduit": "Flexible metal conduit protects conductors while allowing bends around equipment and tight installation areas.",
    "Conduit junction box wiring": "This image shows conductors being connected inside a junction box as part of a conduit wiring system.",
    "Wire stripping example": "This example shows insulation being removed so the conductor can be joined or terminated properly.",
    "Multi-core cable in flexible conduit": "This image shows insulated conductors grouped inside flexible conduit for protected routing.",
    "Cable tray elbow section": "This cable tray section supports and routes groups of cables around a change in direction.",
    "Sheathed power cable": "This sheathed cable groups multiple conductors inside one durable outer covering for power distribution.",
    "Series circuit lamp diagram": "This diagram shows lamps connected in series where current follows a single path through each load.",
    "PVC conduit pipes": "PVC conduit pipes provide a rigid pathway that protects electrical conductors during installation.",
    "Compression splice connector": "This splice connector is used to join conductors securely within a wiring system.",
    "Wire splice methods": "These examples show common splice methods used to join conductors in electrical work.",
    "Conduit wiring conductor comparison": "This image compares conductor colors and types used when routed through conduit systems.",
    "Parallel circuit lamp diagram": "This diagram shows lamps connected in parallel so each load has its own path across the source.",
    "Hot air rework station": "This hot air rework station is used to heat and remove soldered components during repair or rework.",
    "Soldering flux paste": "Flux paste helps solder flow better and improves bonding by cleaning the joint area during soldering.",
    "Electrical work safety gear chart": "This chart shows the protective equipment that should be prepared before soldering or electrical work begins.",
    "Soldering iron stand with sponge": "This stand safely holds a hot soldering iron and includes a sponge for cleaning the tip.",
    "Helping hands magnifier stand": "Helping hands hold small components in place and provide magnification during precise soldering work.",
    "Digital soldering station": "This soldering station controls heat for soldering tasks and helps maintain a stable working temperature.",
    "Solder wire spool": "This spool contains solder wire used to create electrical joints between conductors and components.",
    "Soldering on a circuit board": "This image shows solder being applied to a circuit board connection during electronic assembly or repair.",
    "Desoldering wick": "Desoldering wick absorbs melted solder so unwanted solder can be removed from a connection.",
    "Desoldering pump": "A desoldering pump removes melted solder by suction during rework and repair.",
    "Capacitor assortment": "This assortment shows common capacitor types used for filtering, timing, and energy storage in circuits.",
    "Film capacitor": "A film capacitor is used for stable capacitance in coupling, filtering, and AC applications.",
    "Cement power resistors": "These power resistors handle higher heat and are used where current limiting or load resistance is needed.",
    "Inductor types chart": "This chart compares common inductor constructions used for filtering, tuning, and energy storage.",
    "Metal film resistors": "Metal film resistors provide stable resistance values for limiting current and dividing voltage.",
    "Toroidal inductor": "A toroidal inductor stores energy in a magnetic field and is often used in filtering and power applications.",
    "Carbon film resistor": "A carbon film resistor is a fixed resistor used to limit current and set circuit operating values.",
    "SMD resistor": "An SMD resistor is a surface-mount resistor used in compact electronic circuits.",
    "Passive components overview": "This overview groups the main passive components learners should recognize: resistor, capacitor, inductor, and transformer.",
    "Resistor color code chart": "This chart helps identify resistor values and tolerances using color bands.",
    "Rotary potentiometer": "A rotary potentiometer is a variable resistor used to adjust resistance in a circuit.",
    "Iron-core inductor": "An iron-core inductor is used where stronger inductance is needed in filters and power circuits.",
    "Electrolytic capacitor": "An electrolytic capacitor stores electrical charge and is commonly used for smoothing and filtering.",
    "Mixed resistor assortment": "This assortment shows different resistor values and sizes used for current control and voltage division.",
    "Ceramic disc capacitor": "A ceramic disc capacitor is commonly used for bypassing, filtering, and high-frequency applications.",
    "Axial electrolytic capacitors": "These axial electrolytic capacitors store charge and are used in timing and power-supply filtering circuits.",
    "Air-core inductor": "An air-core inductor provides inductance without a magnetic core and is often used in high-frequency circuits.",
    "Ceramic capacitor": "A ceramic capacitor stores a small amount of charge and is commonly used for decoupling and filtering.",
    "DIP integrated circuit": "This dual in-line package integrated circuit combines many electronic functions into one compact chip.",
    "LED assortment": "These LEDs are active components that emit light when current passes in the correct direction.",
    "LM324 integrated circuit": "The LM324 is an integrated circuit that contains multiple operational amplifiers in one package.",
    "Wall toggle switch": "This switch controls the opening and closing of a circuit path in an electrical installation.",
    "JST wire connectors": "These compact connectors are used to join wires and active circuit modules in electronic assemblies.",
    "Transistor package assortment": "These transistor packages show common semiconductor forms used for switching and amplification.",
    "Banana plug connectors": "Banana plugs are used to make temporary electrical connections in testing and circuit setups.",
    "Toggle switch": "A toggle switch manually changes a circuit between open and closed states.",
    "Signal diode": "A diode allows current to pass mainly in one direction and is used for rectification and protection.",
    "DM741 integrated circuit": "The DM741 is an operational amplifier integrated circuit used in analog signal applications.",
    "Diode assortment with LED": "This assortment shows common diode forms including an LED used for indication and light output.",
    "Screw terminal blocks": "Screw terminal blocks provide a secure way to connect conductors to a circuit or device.",
    "Semiconductor package assortment": "These packages show different active component forms used for transistors and other semiconductor devices.",
    "NE555 timer IC": "The NE555 timer is an integrated circuit used for timing, pulse generation, and switching applications."
  };

  if (literalInfo[caption]) {
    return literalInfo[caption];
  }

  const moduleInfo = {
    "Introduction to Electricity and Electronics": "This visual supports the lesson by showing real electrical work, tools, or protective equipment used in the field.",
    "Personal Protective Equipment (PPE)": "This image shows protective equipment that helps reduce risk before electrical work begins.",
    "Tools for Electrical Work": "This image shows a tool commonly used to install, test, hold, cut, or prepare electrical connections.",
    "Basic Electrical Quantities": "This visual helps explain an electrical value, measuring instrument, or circuit concept used in the lesson.",
    "Direct Current (DC) vs. Alternating Current (AC)": "This image supports the comparison between different forms of electrical current and where they are used.",
    "Types of Wires and Cables": "This visual shows a wire, cable, or wiring example that supports correct identification and use.",
    "Wiring Methods": "This image shows a wiring path, installation method, or setup used in practical electrical work.",
    "Soldering and Desoldering Techniques": "This visual supports the process of joining or removing electronic connections safely.",
    "Passive Components": "This image shows a passive component that affects current, voltage, or signal behavior without amplification.",
    "Active Components": "This image shows an active component that controls, amplifies, or switches electrical signals.",
    "Parts of the Computer and Input Output Devices": "This image shows a computer component or peripheral device learners should be able to recognize.",
    "Safety Tools": "This image shows a safety tool or protective item used to protect the technician or the equipment.",
    OHS: "This visual reinforces occupational health and safety practices, hazard awareness, or protective behavior.",
    Motherboard: "This image supports identification of motherboard parts, sockets, slots, or connected components.",
    "Basic Computer Configuration Setup": "This visual supports assembly, setup, or system configuration steps in computer servicing.",
    "Preventive Maintenance": "This image supports proper cleaning, inspection, or maintenance procedures for computer hardware.",
    Troubleshooting: "This image supports diagnosis, fault recognition, or repair-related thinking in computer servicing.",
    History: "This visual supports the lesson by showing a person, device, or milestone in computer history."
  };

  return moduleInfo[moduleTitle] || `This image supports the module by giving a visual example related to the lesson topic (${index + 1}).`;
}

function curateModuleImages(title, images) {
  const config = IMAGE_CURATION[title] || { captionPrefix: "Module visual" };
  return images.map((image, index) => {
    const hasCustomCaption =
      typeof image.caption === "string" &&
      image.caption.trim() &&
      !image.caption.startsWith("Reference visual");
    const caption =
      LITERAL_IMAGE_CAPTIONS[image.src] ||
      (hasCustomCaption ? image.caption : `${config.captionPrefix} ${index + 1}`);
    return {
      ...image,
      caption,
      alt: caption || image.alt || `${title} visual ${index + 1}`,
      info: image.info || getImageInfo(title, caption, index)
    };
  });
}

const DOCUMENT_LAYOUTS = {
  "Introduction to Electricity and Electronics": {
    sections: [
      {
        heading: "What Is Electricity?",
        paragraphs: [
          "Electricity is a form of energy created by the movement of electrons. It powers tools, appliances, machines, and modern systems used in daily life.",
          "Atoms contain protons, neutrons, and electrons. When electrons move from one atom to another, electric charge and electric current are produced."
        ]
      },
      {
        heading: "What A Circuit Needs",
        paragraphs: [
          "A simple circuit usually needs a source, a conductive path, a load, and sometimes a switch to control current flow.",
          "When the path is complete, electrons can move through the conductor and the load."
        ]
      }
    ],
    tables: [
      {
        title: "Two Main Forms of Electricity",
        columns: ["Type", "How It Behaves", "Common Example"],
        rows: [
          ["Static Electricity", "Electricity at rest caused by an imbalance of charge on a surface.", "A balloon rubbed on hair or a shock from a doorknob."],
          ["Current Electricity", "Continuous flow of electrons through a conductor.", "Lighting, appliances, phones, and machines."]
        ]
      }
    ]
  },
  "Personal Protective Equipment (PPE)": {
    sections: [
      {
        heading: "Why PPE Matters",
        paragraphs: [
          "PPE is a vital line of defense against electric shock, arc flash burns, flying debris, and noise exposure.",
          "It reduces injury severity and protects important parts of the body while working around energized circuits or high-voltage equipment."
        ]
      }
    ],
    tables: [
      {
        title: "Common Electrical PPE and Their Functions",
        columns: ["PPE Item", "Visual", "Description", "Example Use"],
        rows: [
          [
            "Insulated gloves",
            { src: "assets/modules/electrical/easy/module2/image-06.jpg", caption: "Insulated protective gloves" },
            "Provide a barrier between the skin and electric current.",
            "Used when working on live wires or exposed conductors."
          ],
          [
            "Safety goggles / face shield",
            { src: "assets/modules/electrical/easy/module2/image-03.jpg", caption: "Face shield helmet" },
            "Protect the eyes and face from arc flashes, sparks, and flying fragments.",
            "Used while grinding, soldering, or testing circuits."
          ],
          [
            "Rubber-soled boots",
            { src: "assets/modules/electrical/easy/module2/image-05.jpg", caption: "Electrical safety boots" },
            "Help prevent grounding through the body by insulating the wearer from the floor.",
            "Used on wet floors, metallic floors, or outdoor setups."
          ],
          [
            "Flame-resistant clothing",
            { src: "assets/modules/electrical/easy/module1/image-04.png", caption: "High-visibility work coveralls" },
            "Made from materials that resist ignition and melting under heat or arc flash exposure.",
            "Worn during high-voltage or industrial electrical work."
          ]
        ]
      }
    ]
  },
  "Tools for Electrical Work": {
    sections: [
      {
        heading: "Use The Right Tool",
        paragraphs: [
          "The right tool improves safety, accuracy, and speed. The wrong tool can damage equipment, create hazards, or cause poor electrical connections."
        ]
      }
    ],
    tables: [
      {
        title: "Essential Electrical Tools and Their Uses",
        columns: ["Tool", "Visual", "Purpose", "Example Use"],
        rows: [
          ["Insulated screwdriver", { src: "assets/modules/electrical/easy/module3/image-05.jpg", caption: "Insulated screwdriver set" }, "Tightens or loosens terminals with added protection.", "Installing switches, outlets, or terminal blocks."],
          ["Combination pliers", { src: "assets/modules/electrical/easy/module3/image-09.jpg", caption: "Lineman pliers" }, "Grips, bends, twists, and cuts wires.", "Twisting wires together before connecting them."],
          ["Wire stripper", { src: "assets/modules/electrical/easy/module3/image-03.jpg", caption: "Wire stripper" }, "Removes insulation without damaging the conductor.", "Preparing wires before connection."],
          ["Needle-nose pliers", { src: "assets/modules/electrical/easy/module3/image-07.jpg", caption: "Long nose pliers" }, "Reaches into tight spaces and holds small wires.", "Guiding wires inside boxes or enclosures."],
          ["Multimeter", { src: "assets/modules/electrical/easy/module3/image-01.jpg", caption: "Digital multimeter" }, "Measures voltage, current, resistance, and continuity.", "Checking outlet voltage or diagnosing a fault."],
          ["Fish tape", { src: "assets/modules/electrical/easy/module3/image-08.jpg", caption: "Fish tape wire puller" }, "Pulls wires through conduits, ceilings, or wall cavities.", "Routing new conductors in a building."]
        ]
      }
    ]
  },
  "Basic Electrical Quantities": {
    sections: [
      {
        heading: "Core Electrical Values",
        paragraphs: [
          "Voltage, current, resistance, and power are the four main electrical quantities students must understand before solving circuit problems.",
          "Each quantity has its own meaning, unit, and measuring method inside a circuit."
        ]
      },
      {
        heading: "Using Ohm's Law",
        paragraphs: [
          "Ohm's Law links voltage, current, and resistance through the relationship V = I x R.",
          "It is one of the most important tools for circuit analysis, design, and troubleshooting."
        ]
      }
    ],
    tables: [
      {
        title: "Electrical Quantities Reference",
        columns: ["Quantity", "Symbol", "Unit", "Measuring Tool"],
        rows: [
          ["Voltage", "V", "Volt", "Voltmeter"],
          ["Current", "I", "Ampere", "Ammeter"],
          ["Resistance", "R", "Ohm", "Ohmmeter / Multimeter"],
          ["Power", "P", "Watt", "Calculated"]
        ]
      }
    ]
  },
  "Direct Current (DC) vs. Alternating Current (AC)": {
    sections: [
      {
        heading: "Direct Current",
        paragraphs: [
          "Direct current flows in one direction only and is common in batteries, power banks, solar panels, and many portable devices.",
          "It is steady and well suited for low-voltage electronics."
        ]
      },
      {
        heading: "Alternating Current",
        paragraphs: [
          "Alternating current reverses direction periodically and is the standard form used in homes, schools, and power distribution networks.",
          "Its main advantage is that it can be stepped up or down more easily for efficient transmission."
        ]
      }
    ],
    tables: [
      {
        title: "DC vs AC Comparison",
        columns: ["Type", "Direction of Flow", "Frequency", "Common Sources"],
        rows: [
          ["Direct Current (DC)", "Flows in one direction only", "0 Hz", "Batteries, solar panels, USB chargers"],
          ["Alternating Current (AC)", "Reverses direction periodically", "50 or 60 Hz", "Household outlets, generators, appliances"]
        ]
      }
    ]
  },
  "Types of Wires and Cables": {
    sections: [
      {
        heading: "Wire and Cable Basics",
        paragraphs: [
          "A wire is a single conductor, while a cable groups multiple conductors inside one sheath or jacket.",
          "This distinction is important when selecting materials for power, signal, or communication work."
        ]
      },
      {
        heading: "Choosing The Right One",
        paragraphs: [
          "Selection depends on the environment, the required current, the type of insulation, and how much physical protection the installation needs.",
          "Gauge and insulation both affect safety, efficiency, and code compliance."
        ]
      }
    ],
    tables: [
      {
        title: "Common Types of Wires and Cables",
        columns: ["Type", "Description", "Typical Application"],
        rows: [
          ["THHN", "Single conductor wire with heat-resistant insulation and nylon coating.", "Commercial or industrial conduit runs"],
          ["Romex", "Non-metallic sheathed cable with hot, neutral, and ground conductors.", "Residential lighting, outlets, and switches"],
          ["UF Cable", "Underground feeder cable with moisture-resistant outer sheath.", "Outdoor and underground installations"],
          ["Coaxial Cable", "Single inner conductor with shielding to reduce signal loss.", "TV, cable, and internet modems"],
          ["Twisted Pair", "Paired conductors twisted to reduce interference.", "Ethernet, telephones, and data transmission"],
          ["MC Cable", "Metal-clad cable with built-in physical protection.", "Commercial exposed runs without conduit"]
        ]
      }
    ]
  },
  "Wiring Methods": {
    sections: [
      {
        heading: "Why Wiring Methods Matter",
        paragraphs: [
          "Wiring methods determine how conductors are routed, protected, and maintained in real installations.",
          "The correct method improves safety and makes future inspection and repair easier."
        ]
      },
      {
        heading: "From Route To Connection",
        paragraphs: [
          "This module also supports understanding of how series, parallel, and splice connections work inside practical wiring setups.",
          "The installation method and the type of connection both affect circuit performance and serviceability."
        ]
      }
    ],
    tables: [
      {
        title: "Common Wiring Methods",
        columns: ["Method", "Description", "Typical Use"],
        rows: [
          ["Conduit Wiring", "Conductors are enclosed in rigid or flexible tubing.", "Industrial plants, commercial buildings, outdoor areas"],
          ["Cable Tray", "Cables rest on a ventilated support structure.", "Factories, data centers, utility tunnels"],
          ["Raceway", "Surface-mounted enclosed channel for wires.", "Offices, schools, visible classroom wiring"],
          ["Direct Burial", "Outdoor-rated cable is buried directly in soil.", "Garden lighting, outdoor feeders"],
          ["Armored Cable", "Cable includes metal armor for mechanical protection.", "Retrofits and commercial remodels"],
          ["Flexible Metal Conduit", "Spiral-wrapped conduit bends easily around equipment.", "Motors, HVAC units, pumps"]
        ]
      }
    ]
  },
  "Passive Components": {
    sections: [
      {
        heading: "Passive Component Roles",
        paragraphs: [
          "Passive components do not generate energy. Instead, they limit, store, or shape electrical energy in a circuit.",
          "Resistors, capacitors, and inductors each affect current and voltage in different ways."
        ]
      },
      {
        heading: "Identification and Application",
        paragraphs: [
          "Students should be able to identify symbols, units, and common uses for each passive component type.",
          "This includes resistor color codes, capacitor polarity, and the magnetic behavior of inductors."
        ]
      }
    ],
    tables: [
      {
        title: "Main Passive Components",
        columns: ["Component", "Main Function", "Unit", "Example Use"],
        rows: [
          ["Resistor", "Limits current or divides voltage.", "Ohm", "LED protection, signal conditioning, voltage dividers"],
          ["Capacitor", "Stores and releases electrical energy.", "Farad", "Filtering, timing, power smoothing"],
          ["Inductor", "Stores energy in a magnetic field and resists current change.", "Henry", "Power supplies, filters, RF circuits"]
        ]
      }
    ]
  },
  "Active Components": {
    sections: [
      {
        heading: "How Active Parts Differ",
        paragraphs: [
          "Active components require power and actively control the movement of current or signals in a circuit.",
          "They are used for switching, amplifying, regulating, and combining multiple circuit functions."
        ]
      },
      {
        heading: "Building Real Electronic Systems",
        paragraphs: [
          "This lesson connects single active parts like diodes and transistors to integrated circuits, relays, switches, and connectors.",
          "That helps students see how active devices work together in practical electronics."
        ]
      }
    ],
    tables: [
      {
        title: "Main Active Components",
        columns: ["Component", "Main Function", "Example Use"],
        rows: [
          ["Diode", "Allows current to flow in one direction.", "Rectifiers, voltage regulation, LEDs"],
          ["Transistor", "Acts as a switch or amplifier.", "Turning motors or LEDs on and off, boosting signals"],
          ["Integrated Circuit", "Combines many components in one package.", "Timers, logic gates, amplifiers"]
        ]
      }
    ]
  },
  "Parts of the Computer and Input Output Devices": {
    tables: [
      {
        title: "Common Computer Parts",
        columns: ["Category", "Examples", "Main Function"],
        rows: [
          ["Input devices", "Keyboard, mouse, microphone", "Send data or commands into the computer"],
          ["Output devices", "Monitor, printer, speakers", "Present information from the computer to the user"],
          ["Internal parts", "CPU, RAM, PSU, HDD, BIOS, CMOS", "Process, store, power, and manage system operation"]
        ]
      }
    ]
  },
  "Safety Tools": {
    tables: [
      {
        title: "Safety and ESD Tools",
        columns: ["Tool", "Main Protection", "Example Use"],
        rows: [
          ["Safety goggles and gloves", "Protect the technician from debris and handling risks", "Computer repair and cleaning tasks"],
          ["Anti-static wrist strap", "Prevents electrostatic discharge from damaging parts", "Handling RAM, motherboard, and add-on cards"],
          ["Anti-static mat", "Creates a safer grounded work surface", "Bench repair and component handling"],
          ["Compressed air and cleaning cloth", "Supports safe cleaning without damaging components", "Preventive maintenance and dust removal"]
        ]
      }
    ]
  },
  OHS: {
    tables: [
      {
        title: "OHS Focus Areas",
        columns: ["Focus", "Why It Matters", "Typical Practice"],
        rows: [
          ["Clean workspace", "Reduces accidents and protects equipment", "Keep tools arranged and remove clutter"],
          ["Correct behavior", "Prevents unsafe actions in the lab", "Follow instructions and avoid horseplay"],
          ["Hazard awareness", "Helps learners avoid preventable risks", "Recognize electrical, chemical, and physical hazards"]
        ]
      }
    ]
  },
  Motherboard: {
    tables: [
      {
        title: "Motherboard Parts and Functions",
        columns: ["Part", "Role", "Why It Matters"],
        rows: [
          ["CPU socket", "Holds the processor", "Determines processor compatibility"],
          ["RAM slots", "Hold memory modules", "Affect memory capacity and upgrade path"],
          ["PCIe slots", "Support expansion cards", "Allow GPUs, network cards, and other add-ons"],
          ["SATA / NVMe interfaces", "Connect storage devices", "Affect drive support and performance"],
          ["CMOS battery", "Keeps time and firmware settings", "Preserves BIOS or UEFI configuration"]
        ]
      }
    ]
  },
  "Basic Computer Configuration Setup": {
    tables: [
      {
        title: "Configuration Workflow",
        columns: ["Stage", "Main Focus", "Example Task"],
        rows: [
          ["Preparation", "Safety and workspace readiness", "Power down, use ESD protection, organize tools"],
          ["Disassembly", "Remove parts in safe order", "Disconnect cables and remove components carefully"],
          ["Assembly", "Install parts in proper sequence", "Mount board, install CPU and RAM, connect PSU"],
          ["Testing", "Check POST and startup behavior", "Listen for beeps and confirm drives are detected"]
        ]
      }
    ]
  },
  "Preventive Maintenance": {
    tables: [
      {
        title: "Preventive Maintenance Checklist",
        columns: ["Area", "What To Do", "Purpose"],
        rows: [
          ["Planning", "Review schedule and requirements first", "Keeps maintenance organized and complete"],
          ["Cleaning", "Use compressed air and proper tools", "Removes dust and reduces heat buildup"],
          ["Inspection", "Check RAM seating, cables, screws, and wear", "Helps find faults before failure happens"],
          ["Software safety", "Create a System Restore Point before updates", "Protects the system during software maintenance"]
        ]
      }
    ]
  },
  Troubleshooting: {
    tables: [
      {
        title: "Troubleshooting Paths",
        columns: ["Symptom", "Possible Cause", "First Check"],
        rows: [
          ["No power", "PSU, cable, switch, or outlet issue", "Verify power source and PSU switch"],
          ["No display or beep", "RAM, motherboard, or POST issue", "Reseat or test RAM and inspect startup clues"],
          ["Sudden shutdown", "Overheating or unstable power", "Check fans, heatsinks, and airflow"],
          ["No boot device", "Drive, cable, or BIOS detection issue", "Inspect storage connection and firmware settings"]
        ]
      }
    ]
  },
  History: {
    tables: [
      {
        title: "Computer History Figures",
        columns: ["Name", "Known For", "Historical Importance"],
        rows: [
          ["Charles Babbage", "Analytical Engine", "Early concept of programmable computation"],
          ["Ada Lovelace", "Algorithm design", "Often cited as an early programming pioneer"],
          ["Alan Turing", "Computation theory", "Helped shape modern computer science"],
          ["Tim Berners-Lee", "World Wide Web", "Transformed how information is shared online"]
        ]
      }
    ]
  }
};

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getDocumentLayout(data, lessonDetails) {
  const preset = DOCUMENT_LAYOUTS[data?.title] || {};
  const overview = String(data?.content || "")
    .split(/\n\s*\n/)[0]
    ?.trim();

  if (preset.sections || preset.tables) {
    return {
      structured: true,
      sections: [
        ...(overview ? [{
          heading: "Lesson Overview",
          paragraphs: [overview]
        }] : []),
        ...(preset.sections || [])
      ],
      tables: preset.tables || []
    };
  }

  const baseSections = String(data?.content || "")
    .split(/\n\s*\n/)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((paragraph, index) => ({
      heading: index === 0 ? "Lesson Overview" : `Lesson Note ${index + 1}`,
      paragraphs: [paragraph]
    }));

  return {
    structured: false,
    sections: [...baseSections, ...((lessonDetails?.sections || []).map((item) => ({
      heading: item.heading,
      paragraphs: [item.body]
    })))],
    tables: []
  };
}

function renderDocumentLayout(data, lessonDetails) {
  const section = document.getElementById("moduleDocumentSection");
  const container = document.getElementById("moduleDocument");
  if (!section || !container || !data) return;

  const layout = getDocumentLayout(data, lessonDetails);
  const hasContent = layout.sections.length || layout.tables.length;
  section.hidden = !hasContent;
  container.innerHTML = "";

  if (!hasContent) return;

  layout.sections.forEach((item) => {
    const card = document.createElement("article");
    card.className = "module-doc-card";
    const paragraphs = (item.paragraphs || [])
      .map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`)
      .join("");
    card.innerHTML = `<h3>${escapeHtml(item.heading)}</h3>${paragraphs}`;
    container.appendChild(card);
  });

  layout.tables.forEach((table) => {
    const card = document.createElement("article");
    card.className = "module-doc-card";
    const head = table.columns.map((column) => `<th>${escapeHtml(column)}</th>`).join("");
    const rows = table.rows.map((row) => {
      const cols = row.map((cell) => {
        if (cell && typeof cell === "object" && cell.src) {
          return `
            <td>
              <div class="module-doc-visual">
                <img src="${escapeHtml(cell.src)}" alt="${escapeHtml(cell.caption || "Module visual")}" loading="lazy" decoding="async">
                <span>${escapeHtml(cell.caption || "")}</span>
              </div>
            </td>
          `;
        }
        return `<td>${escapeHtml(cell)}</td>`;
      }).join("");
      return `<tr>${cols}</tr>`;
    }).join("");

    card.innerHTML = `
      <h3>${escapeHtml(table.title)}</h3>
      <div class="module-doc-table-wrap">
        <table class="module-doc-table">
          <thead><tr>${head}</tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
    container.appendChild(card);
  });
}

function getNextModuleUrl() {
  if (moduleNumber >= totalModulesForDifficulty) {
    return `module-levels.html?subject=${subject}&difficulty=${difficulty}`;
  }

  return `module.html?subject=${subject}&difficulty=${difficulty}&module=module${moduleNumber + 1}`;
}

async function renderModulePage() {
  await loadPublishedModuleEntries();
  const data = await getModuleData();
  const subjectName = subjectNames[subject] || "Subject";
  const difficultyName = difficultyNames[difficulty] || "Difficulty";
  const gallery = document.getElementById("moduleGallery");
  const galleryChip = document.getElementById("moduleGalleryChip");
  const galleryNote = document.getElementById("moduleGalleryNote");
  const objectives = document.getElementById("moduleObjectives");
  const sections = document.getElementById("moduleSections");
  const challengeTitle = document.getElementById("challengeTitle");
  const challengePrompt = document.getElementById("challengePrompt");
  const challengePoints = document.getElementById("challengePoints");

  const lessonDetails = data ? buildGamifiedLesson(data) : null;
  const documentLayout = data ? getDocumentLayout(data, lessonDetails) : null;
  const sectionCardsShell = sections?.closest(".module-sections");

  if (data) {
    saveStudyHistory({
      db,
      user: currentUser,
      payload: {
        key: `module|${subject}|${difficulty}|${moduleKey}`,
        kind: "module",
        title: data.title,
        subject,
        difficulty,
        detail: `Module ${moduleNumber} • ${difficultyName} • ${subjectName}`,
        actionUrl: `module.html?subject=${encodeURIComponent(subject)}&difficulty=${encodeURIComponent(difficulty)}&module=${encodeURIComponent(moduleKey)}`
      }
    }).catch((error) => {
      console.warn("Unable to save study history for module.", error);
    });
  }

  document.getElementById("moduleSubject").textContent = subjectName;
  document.getElementById("moduleDifficulty").textContent = difficultyName;
  document.getElementById("moduleNumber").textContent = `Module ${moduleNumber}`;
  document.getElementById("moduleTag").textContent = `${subjectName.toUpperCase()} MODULE`;
  updateCheckpointUi(false, null);

  if (!data) {
    document.getElementById("title").textContent = "Module content coming soon";
    document.getElementById("moduleSubtitle").textContent =
      `${subjectName} ${difficultyName} module ${moduleNumber} is not filled in yet.`;
    document.getElementById("content").textContent =
      "This lesson slot is already part of the structure, but the full teaching content has not been added yet.";
    document.getElementById("studyTip").textContent =
      "Use this page as a template while we build the full lesson set for every difficulty.";
    document.getElementById("moduleStatusChip").textContent = "Needs content";
    document.getElementById("moduleActionBtn").textContent = "Back to Modules";
    document.getElementById("moduleActionBtn").onclick = goBackToLevels;
    renderPills(objectives, [
      "Wait for the final lesson content",
      "Use this slot to organize the module structure",
      "Prepare images and review notes for this lesson"
    ]);
    renderSections(sections, [
      {
        heading: "Module Setup",
        body: "This module slot already exists in the flow. The next step is to attach the full lesson text, concept explanations, visuals, and review prompts based on the original source material."
      }
    ]);
    renderChallenge(challengeTitle, challengePrompt, challengePoints, {
      title: "Challenge",
      prompt: "What key skill, concept, or safety idea should this module teach once it is fully built?",
      points: [
        "Identify the main lesson focus",
        "List the visuals that should appear here",
        "Prepare the quiz topic that should follow this module"
      ]
    });
      renderModuleImages([], gallery, galleryChip, galleryNote, null);
    return;
  }

  document.getElementById("title").textContent = data.title;
  document.getElementById("moduleSubtitle").textContent =
    lessonDetails?.subtitle || `Study this ${difficultyName.toLowerCase()} lesson before continuing to the next activity.`;
  document.getElementById("content").textContent = data.content;
  document.getElementById("studyTip").textContent =
    data.tip || "Read carefully and identify the key terms before continuing.";
  document.getElementById("moduleStatusChip").textContent = "Read to clear checkpoint";
  document.getElementById("moduleActionBtn").textContent =
    moduleNumber < totalModulesForDifficulty ? "Next Module" : "Return to Modules";
  document.getElementById("moduleActionBtn").onclick = startQuiz;
  renderPills(objectives, lessonDetails?.objectives || []);
  const useLessonPathForTroubleshooting = data.title === "Troubleshooting";
  renderSections(
    sections,
    useLessonPathForTroubleshooting
      ? (lessonDetails?.sections || [])
      : (documentLayout?.structured ? [] : (lessonDetails?.sections || []))
  );
  if (sectionCardsShell) {
    sectionCardsShell.hidden = useLessonPathForTroubleshooting ? false : Boolean(documentLayout?.structured);
  }
  if (useLessonPathForTroubleshooting) {
    const documentSection = document.getElementById("moduleDocumentSection");
    const documentContainer = document.getElementById("moduleDocument");
    if (documentSection) {
      documentSection.hidden = true;
    }
    if (documentContainer) {
      documentContainer.innerHTML = "";
    }
  } else {
    renderDocumentLayout(data, lessonDetails);
  }
  renderChallenge(challengeTitle, challengePrompt, challengePoints, lessonDetails?.challenge);
  renderHistoryTimeline(data);
  renderSolderingProcess(data);
  renderPassiveCircuits(data);
  renderActiveCircuits(data);
  renderMotherboardFormFactors(data);
    renderModuleImages(data.images || [], gallery, galleryChip, galleryNote, data);

  let completed = false;
  let restoredXP = 0;
  let gateState = {
    readBottom: false,
    quickCheckAttempted: false,
    completed: false
  };

  try {
    gateState = await getModuleGateState();
    currentModuleGateState = gateState;
    completed = gateState.completed;

    if (completed) {
      restoredXP = await awardModuleXPOnce();
    }
  } catch (error) {
    console.error("Unable to load module completion state:", error);
  }

  updateCheckpointUi(
    completed,
    completed && restoredXP > 0 ? `Checkpoint cleared +${restoredXP} XP` : null,
    gateState
  );
  if (completed) {
    document.getElementById("moduleStatusChip").textContent =
      restoredXP > 0 ? `Checkpoint cleared +${restoredXP} XP` : "Checkpoint cleared";
  }
  setupAutoCheckpoint(data, completed);
}

function buildGamifiedLesson(data) {
  const preset = GAMIFIED_DETAILS[data.title];
  if (preset) {
    return {
      subtitle: preset.subtitle,
      objectives: preset.objectives,
      sections: preset.sections,
      challenge: {
        ...preset.challenge,
        quiz: CHALLENGE_QUIZZES[data.title] || preset.challenge?.quiz || null
      }
    };
  }

  return {
    subtitle: `Study this lesson carefully and prepare for the next activity.`,
    objectives: [
      "Understand the main topic of the module",
      "Identify the key terms and functions in the lesson",
      "Prepare to apply the concept in the next task"
    ],
    sections: [
      {
        heading: "Core Lesson",
        body: data.content
      }
    ],
    challenge: {
      title: "Quick Check",
      prompt: "Summarize the lesson in your own words before continuing.",
      points: [
        "State the main concept",
        "Recall one practical use",
        "Explain one safety or technical idea from the lesson"
      ]
    }
  };
}

function renderPills(container, items) {
  container.innerHTML = "";

  items.forEach((item, index) => {
    const pill = document.createElement("div");
    pill.className = "module-pill";
    pill.innerHTML = `
      <span class="module-pill-index">${index + 1}</span>
      <span>${item}</span>
    `;
    container.appendChild(pill);
  });
}

function renderSections(container, items) {
  container.innerHTML = "";

  items.forEach((item) => {
    const card = document.createElement("article");
    card.className = "module-section-card";
    card.innerHTML = `
      <h3>${item.heading}</h3>
      <p>${item.body}</p>
    `;
    container.appendChild(card);
  });
}

function renderMiniQuiz(container, quizItems) {
  container.innerHTML = "";

  const quiz = document.createElement("div");
  quiz.className = "module-quiz";

  quizItems.forEach((item, index) => {
    const card = document.createElement("article");
    card.className = "module-quiz-card";
    card.innerHTML = `
      <div class="module-quiz-question-row">
        <span class="module-quiz-index">${index + 1}</span>
        <h3 class="module-quiz-question">${item.question}</h3>
      </div>
      <div class="module-quiz-options">
        ${(item.options || []).map((option) => `
          <label class="module-quiz-option">
            <input type="radio" name="module-quiz-${index}" value="${option}">
            <span>${option}</span>
          </label>
        `).join("")}
      </div>
      <p class="module-quiz-feedback" id="moduleQuizFeedback${index}"></p>
    `;
    quiz.appendChild(card);
  });

  const actions = document.createElement("div");
  actions.className = "module-quiz-actions";
  actions.innerHTML = `
    <button type="button" class="module-btn primary-btn" id="moduleQuizCheckBtn">Check Answers</button>
    <p class="module-quiz-score" id="moduleQuizScore"></p>
  `;
  quiz.appendChild(actions);
  container.appendChild(quiz);

  const checkBtn = document.getElementById("moduleQuizCheckBtn");
  const scoreEl = document.getElementById("moduleQuizScore");

  checkBtn?.addEventListener("click", async () => {
    let score = 0;

    quizItems.forEach((item, index) => {
      const selected = container.querySelector(`input[name="module-quiz-${index}"]:checked`);
      const feedback = document.getElementById(`moduleQuizFeedback${index}`);

      if (!feedback) return;

      if (!selected) {
        feedback.textContent = "Choose one answer first.";
        feedback.className = "module-quiz-feedback pending";
        return;
      }

      if (selected.value === item.answer) {
        score += 1;
        feedback.textContent = `Correct: ${item.answer}`;
        feedback.className = "module-quiz-feedback correct";
      } else {
        feedback.textContent = `Correct answer: ${item.answer}`;
        feedback.className = "module-quiz-feedback incorrect";
      }
    });

    const xpEarned = await awardQuickCheckXP(score * QUICK_CHECK_XP_PER_CORRECT);

    if (scoreEl) {
      if (xpEarned > 0) {
        scoreEl.textContent = `Score: ${score} / ${quizItems.length} • +${xpEarned} XP`;
      } else {
        scoreEl.textContent = `Score: ${score} / ${quizItems.length}`;
      }
    }
  });
}

function renderChallenge(titleEl, promptEl, pointsEl, challenge = null) {
  const fallback = challenge || {
    title: "Challenge",
    prompt: "Summarize the lesson in your own words before continuing.",
    points: ["Define the topic", "Explain one real use", "Recall one safety or practical rule"]
  };

  titleEl.textContent = fallback.title;
  promptEl.textContent = fallback.prompt;
  if (Array.isArray(fallback.quiz) && fallback.quiz.length) {
    renderMiniQuiz(pointsEl, fallback.quiz);
    return;
  }

  renderPills(pointsEl, fallback.points || []);
}

function getHistoryTimelineItems() {
  return [
    { year: "1830s", name: "Charles Babbage", text: "Designed the Difference Engine and Analytical Engine as early machine-computing concepts." },
    { year: "1840s", name: "Ada Lovelace", text: "Described how a machine could follow ordered instructions like a program." },
    { year: "1941", name: "Konrad Zuse", text: "Built the Z3, one of the earliest programmable computers." },
    { year: "1940s", name: "Alan Turing", text: "Helped define machine logic and the theoretical foundation of computing." },
    { year: "1945", name: "John von Neumann", text: "Shaped the stored-program architecture model used in modern computers." },
    { year: "1950s", name: "Grace Hopper", text: "Advanced compiler ideas and higher-level programming languages." },
    { year: "1970s", name: "Robert Metcalfe", text: "Co-invented Ethernet and helped shape the growth of computer networking." },
    { year: "1989+", name: "Tim Berners-Lee", text: "Created the World Wide Web and transformed global information sharing." }
  ];
}

function renderHistoryTimeline(moduleData) {
  const section = document.getElementById("moduleTimelineSection");
  const visual = document.getElementById("moduleTimelineVisual");
  const strip = document.getElementById("moduleTimelineStrip");
  const note = document.getElementById("moduleTimelineNote");

  if (!section || !visual || !strip || !note) return;

  const timelineImage = (moduleData.images || []).find(
    (image) => image.caption === "Computer history timeline"
  );

  if (moduleData.title !== "History" || !timelineImage) {
    section.hidden = true;
    visual.innerHTML = "";
    strip.innerHTML = "";
    return;
  }

  section.hidden = false;
  visual.innerHTML = `<img src="${timelineImage.src}" alt="${timelineImage.alt || "Computer history timeline"}" loading="lazy" decoding="async">`;
  strip.innerHTML = getHistoryTimelineItems().map((item) => `
    <article class="module-timeline-item">
      <span class="module-timeline-year">${item.year}</span>
      <h3 class="module-timeline-name">${item.name}</h3>
      <p class="module-timeline-text">${item.text}</p>
    </article>
  `).join("");
  note.textContent = "Use the visual timeline first, then review the literal timeline cards below to connect each inventor to the right part of computer history.";
}

function getSolderingProcessSteps(moduleData) {
  const findImage = (caption) => (moduleData.images || []).find((image) => image.caption === caption) || null;

  return [
    {
      title: "Step 1: Prepare the bench and safety gear",
      text: "Set up the work area, prepare the safety gear, and make sure the station is ready before heating the joint.",
      caption: "Electrical work safety gear chart",
      note: "Preparation helps reduce mistakes and keeps soldering work safer."
    },
    {
      title: "Step 2: Set the iron and secure the workpiece",
      text: "Place the iron in its stand, set the working temperature, and hold the part in place with helping hands if needed.",
      caption: "Digital soldering station",
      note: "Stable temperature and a secure workpiece make the solder joint easier to control."
    },
    {
      title: "Step 3: Apply flux before heating",
      text: "Add flux to the joint area so the solder flows cleanly and bonds better to the metal surfaces.",
      caption: "Soldering flux paste",
      note: "Flux helps clean the joint and improves solder flow during the process."
    },
    {
      title: "Step 4: Heat the joint and feed solder",
      text: "Touch the heated tip to the joint and feed solder into the hot connection until a smooth joint forms.",
      caption: "Soldering on a circuit board",
      note: "The solder should melt into the heated joint, not only on the tip."
    },
    {
      title: "Step 5: Use wick to remove excess solder",
      text: "When correcting a joint, place desoldering wick on the area and heat it so excess solder is absorbed.",
      caption: "Desoldering wick",
      note: "Desoldering wick helps clean solder from pads and terminals during rework."
    },
    {
      title: "Step 6: Finish rework with a pump or rework tool",
      text: "Use a desoldering pump or hot air tool when needed, then inspect the joint before replacing or resoldering the part.",
      caption: "Desoldering pump",
      note: "The final step is to clear old solder and check that the connection is ready for repair."
    }
  ].map((step) => ({
    ...step,
    image: findImage(step.caption)
  }));
}

function renderSolderingProcess(moduleData) {
  const section = document.getElementById("moduleProcessSection");
  const title = document.getElementById("moduleProcessTitle");
  const chip = document.getElementById("moduleProcessChip");
  const grid = document.getElementById("moduleProcessGrid");
  const note = document.getElementById("moduleProcessNote");

  if (!section || !title || !chip || !grid || !note) return;

  if (moduleData.title !== "Soldering and Desoldering Techniques") {
    section.hidden = true;
    grid.innerHTML = "";
    return;
  }

  const steps = getSolderingProcessSteps(moduleData);
  section.hidden = false;
  title.textContent = "Soldering and Desoldering Steps";
  chip.textContent = `${steps.length} process steps`;
  note.textContent =
    "Follow these steps in order to prepare the bench, create a clean solder joint, and remove solder safely during rework.";

  grid.innerHTML = steps.map((step, index) => `
    <article class="module-step-card">
      <div class="module-step-media">
        ${step.image ? `<img src="${step.image.src}" alt="${step.image.alt || step.caption}" loading="lazy" decoding="async">` : ""}
      </div>
      <div class="module-step-copy">
        <span class="module-step-index">Step ${index + 1}</span>
        <h3 class="module-step-title">${step.title}</h3>
        <p class="module-step-text">${step.text}</p>
        <div class="module-step-caption">${step.caption}</div>
        <p class="module-step-note">${step.note}</p>
      </div>
    </article>
  `).join("");
}

function getPassiveCircuitCards() {
  return [
    {
      title: "Resistor Sample Circuit",
      description: "This simple LED circuit uses a resistor in series to limit current and protect the LED from too much current flow.",
      purpose: "Purpose: current limiting for an LED load.",
      diagram: `
        <svg viewBox="0 0 520 190" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Resistor sample circuit">
          <rect width="520" height="190" fill="#102038"/>
          <path d="M50 95 H130" stroke="#9fdcff" stroke-width="4" fill="none"/>
          <path d="M130 95 l12 -18 l12 36 l12 -36 l12 36 l12 -36 l12 18" stroke="#ffd36f" stroke-width="4" fill="none"/>
          <path d="M202 95 H300" stroke="#9fdcff" stroke-width="4" fill="none"/>
          <circle cx="332" cy="95" r="22" fill="none" stroke="#7cf7d2" stroke-width="4"/>
          <path d="M320 95 h10 l8 -12" stroke="#7cf7d2" stroke-width="4" fill="none"/>
          <path d="M354 95 H430 V55 H50 V95" stroke="#9fdcff" stroke-width="4" fill="none"/>
          <rect x="70" y="124" width="60" height="24" rx="6" fill="#203659" stroke="#9fdcff" stroke-width="2"/>
          <line x1="86" y1="124" x2="86" y2="148" stroke="#9fdcff" stroke-width="2"/>
          <line x1="114" y1="120" x2="114" y2="152" stroke="#9fdcff" stroke-width="4"/>
          <text x="50" y="42" fill="#ffffff" font-size="18" font-weight="700">Battery + Resistor + LED</text>
          <text x="132" y="66" fill="#ffd36f" font-size="14">Resistor</text>
          <text x="310" y="66" fill="#7cf7d2" font-size="14">LED</text>
        </svg>
      `
    },
    {
      title: "Capacitor Sample Circuit",
      description: "This RC example places a resistor and capacitor together to show how a capacitor charges and smooths or delays voltage changes.",
      purpose: "Purpose: timing and voltage smoothing in an RC network.",
      diagram: `
        <svg viewBox="0 0 520 190" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Capacitor sample circuit">
          <rect width="520" height="190" fill="#102038"/>
          <path d="M50 95 H130" stroke="#9fdcff" stroke-width="4" fill="none"/>
          <path d="M130 95 l12 -18 l12 36 l12 -36 l12 36 l12 -36 l12 18" stroke="#ffd36f" stroke-width="4" fill="none"/>
          <path d="M202 95 H270" stroke="#9fdcff" stroke-width="4" fill="none"/>
          <line x1="278" y1="65" x2="278" y2="125" stroke="#ff8ad6" stroke-width="5"/>
          <line x1="296" y1="65" x2="296" y2="125" stroke="#ff8ad6" stroke-width="5"/>
          <path d="M296 95 H430 V55 H50 V95" stroke="#9fdcff" stroke-width="4" fill="none"/>
          <rect x="70" y="124" width="60" height="24" rx="6" fill="#203659" stroke="#9fdcff" stroke-width="2"/>
          <line x1="86" y1="124" x2="86" y2="148" stroke="#9fdcff" stroke-width="2"/>
          <line x1="114" y1="120" x2="114" y2="152" stroke="#9fdcff" stroke-width="4"/>
          <text x="50" y="42" fill="#ffffff" font-size="18" font-weight="700">Battery + Resistor + Capacitor</text>
          <text x="132" y="66" fill="#ffd36f" font-size="14">Resistor</text>
          <text x="250" y="66" fill="#ff8ad6" font-size="14">Capacitor</text>
        </svg>
      `
    },
    {
      title: "Inductor Sample Circuit",
      description: "This RL example shows an inductor in series with a resistor and source, a common arrangement for current filtering and magnetic energy storage.",
      purpose: "Purpose: filtering and magnetic energy storage in an RL circuit.",
      diagram: `
        <svg viewBox="0 0 520 190" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Inductor sample circuit">
          <rect width="520" height="190" fill="#102038"/>
          <path d="M50 95 H120" stroke="#9fdcff" stroke-width="4" fill="none"/>
          <path d="M120 95 c8 -24 20 -24 28 0 c8 24 20 24 28 0 c8 -24 20 -24 28 0 c8 24 20 24 28 0" stroke="#32ffc7" stroke-width="4" fill="none"/>
          <path d="M232 95 H300" stroke="#9fdcff" stroke-width="4" fill="none"/>
          <path d="M300 95 l12 -18 l12 36 l12 -36 l12 36 l12 -36 l12 18" stroke="#ffd36f" stroke-width="4" fill="none"/>
          <path d="M372 95 H430 V55 H50 V95" stroke="#9fdcff" stroke-width="4" fill="none"/>
          <rect x="70" y="124" width="60" height="24" rx="6" fill="#203659" stroke="#9fdcff" stroke-width="2"/>
          <line x1="86" y1="124" x2="86" y2="148" stroke="#9fdcff" stroke-width="2"/>
          <line x1="114" y1="120" x2="114" y2="152" stroke="#9fdcff" stroke-width="4"/>
          <text x="50" y="42" fill="#ffffff" font-size="18" font-weight="700">Battery + Inductor + Resistor</text>
          <text x="122" y="66" fill="#32ffc7" font-size="14">Inductor</text>
          <text x="304" y="66" fill="#ffd36f" font-size="14">Resistor</text>
        </svg>
      `
    },
    {
      title: "Potentiometer Sample Circuit",
      description: "This variable-resistor example shows a potentiometer adjusting the brightness of an LED by changing the resistance in the circuit.",
      purpose: "Purpose: adjustable resistance for brightness or signal control.",
      diagram: `
        <svg viewBox="0 0 520 190" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Potentiometer sample circuit">
          <rect width="520" height="190" fill="#102038"/>
          <path d="M50 95 H140" stroke="#9fdcff" stroke-width="4" fill="none"/>
          <path d="M140 95 l12 -18 l12 36 l12 -36 l12 36 l12 -36 l12 18" stroke="#ffd36f" stroke-width="4" fill="none"/>
          <path d="M178 60 l30 25" stroke="#ff8ad6" stroke-width="4" fill="none"/>
          <circle cx="208" cy="85" r="5" fill="#ff8ad6"/>
          <path d="M212 95 H300" stroke="#9fdcff" stroke-width="4" fill="none"/>
          <circle cx="332" cy="95" r="22" fill="none" stroke="#7cf7d2" stroke-width="4"/>
          <path d="M320 95 h10 l8 -12" stroke="#7cf7d2" stroke-width="4" fill="none"/>
          <path d="M354 95 H430 V55 H50 V95" stroke="#9fdcff" stroke-width="4" fill="none"/>
          <rect x="70" y="124" width="60" height="24" rx="6" fill="#203659" stroke="#9fdcff" stroke-width="2"/>
          <line x1="86" y1="124" x2="86" y2="148" stroke="#9fdcff" stroke-width="2"/>
          <line x1="114" y1="120" x2="114" y2="152" stroke="#9fdcff" stroke-width="4"/>
          <text x="50" y="42" fill="#ffffff" font-size="18" font-weight="700">Battery + Potentiometer + LED</text>
          <text x="142" y="66" fill="#ffd36f" font-size="14">Potentiometer</text>
          <text x="310" y="66" fill="#7cf7d2" font-size="14">LED</text>
        </svg>
      `
    }
  ];
}

function getActiveCircuitCards() {
  return [
    {
      title: "Diode Rectifier Circuit",
      description: "This sample shows a diode placed in series with a load so current can pass in one direction and be blocked in the other.",
      purpose: "Purpose: one-way current flow and basic rectification.",
      diagram: `
        <svg viewBox="0 0 520 190" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Diode rectifier circuit">
          <rect width="520" height="190" fill="#102038"/>
          <path d="M50 95 H180" stroke="#9fdcff" stroke-width="4" fill="none"/>
          <path d="M180 75 L180 115 L214 95 Z" fill="none" stroke="#ff8ad6" stroke-width="4"/>
          <line x1="222" y1="75" x2="222" y2="115" stroke="#ff8ad6" stroke-width="4"/>
          <path d="M222 95 H300" stroke="#9fdcff" stroke-width="4" fill="none"/>
          <circle cx="332" cy="95" r="22" fill="none" stroke="#7cf7d2" stroke-width="4"/>
          <path d="M320 95 h10 l8 -12" stroke="#7cf7d2" stroke-width="4" fill="none"/>
          <path d="M354 95 H430 V55 H50 V95" stroke="#9fdcff" stroke-width="4" fill="none"/>
          <rect x="70" y="124" width="60" height="24" rx="6" fill="#203659" stroke="#9fdcff" stroke-width="2"/>
          <line x1="86" y1="124" x2="86" y2="148" stroke="#9fdcff" stroke-width="2"/>
          <line x1="114" y1="120" x2="114" y2="152" stroke="#9fdcff" stroke-width="4"/>
          <text x="50" y="42" fill="#ffffff" font-size="18" font-weight="700">Battery + Diode + LED</text>
          <text x="174" y="66" fill="#ff8ad6" font-size="14">Diode</text>
          <text x="310" y="66" fill="#7cf7d2" font-size="14">LED</text>
        </svg>
      `
    },
    {
      title: "LED Indicator Circuit",
      description: "This circuit uses an LED with a resistor so the LED can safely light when current flows through the path.",
      purpose: "Purpose: light indication in a simple DC circuit.",
      diagram: `
        <svg viewBox="0 0 520 190" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="LED indicator circuit">
          <rect width="520" height="190" fill="#102038"/>
          <path d="M50 95 H130" stroke="#9fdcff" stroke-width="4" fill="none"/>
          <path d="M130 95 l12 -18 l12 36 l12 -36 l12 36 l12 -36 l12 18" stroke="#ffd36f" stroke-width="4" fill="none"/>
          <path d="M202 95 H300" stroke="#9fdcff" stroke-width="4" fill="none"/>
          <circle cx="332" cy="95" r="22" fill="none" stroke="#7cf7d2" stroke-width="4"/>
          <path d="M320 95 h10 l8 -12" stroke="#7cf7d2" stroke-width="4" fill="none"/>
          <path d="M336 72 l10 -14" stroke="#7cf7d2" stroke-width="3"/>
          <path d="M346 58 l-2 10 l8 -4" fill="#7cf7d2"/>
          <path d="M346 82 l10 -14" stroke="#7cf7d2" stroke-width="3"/>
          <path d="M356 68 l-2 10 l8 -4" fill="#7cf7d2"/>
          <path d="M354 95 H430 V55 H50 V95" stroke="#9fdcff" stroke-width="4" fill="none"/>
          <rect x="70" y="124" width="60" height="24" rx="6" fill="#203659" stroke="#9fdcff" stroke-width="2"/>
          <line x1="86" y1="124" x2="86" y2="148" stroke="#9fdcff" stroke-width="2"/>
          <line x1="114" y1="120" x2="114" y2="152" stroke="#9fdcff" stroke-width="4"/>
          <text x="50" y="42" fill="#ffffff" font-size="18" font-weight="700">Battery + Resistor + LED</text>
          <text x="132" y="66" fill="#ffd36f" font-size="14">Resistor</text>
          <text x="310" y="66" fill="#7cf7d2" font-size="14">LED</text>
        </svg>
      `
    },
    {
      title: "Transistor Switch Circuit",
      description: "This transistor circuit shows a small control signal switching a load such as a lamp or LED on and off.",
      purpose: "Purpose: switching a load with transistor control.",
      diagram: `
        <svg viewBox="0 0 520 220" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Transistor switch circuit">
          <rect width="520" height="220" fill="#102038"/>
          <path d="M60 60 H180" stroke="#9fdcff" stroke-width="4" fill="none"/>
          <circle cx="300" cy="110" r="28" fill="none" stroke="#ff8ad6" stroke-width="4"/>
          <line x1="300" y1="82" x2="300" y2="62" stroke="#ff8ad6" stroke-width="4"/>
          <line x1="300" y1="138" x2="300" y2="170" stroke="#ff8ad6" stroke-width="4"/>
          <line x1="272" y1="110" x2="240" y2="110" stroke="#ff8ad6" stroke-width="4"/>
          <line x1="240" y1="110" x2="210" y2="110" stroke="#ff8ad6" stroke-width="4"/>
          <path d="M60 170 H300" stroke="#9fdcff" stroke-width="4" fill="none"/>
          <path d="M300 62 H420 V40 H60 V60" stroke="#9fdcff" stroke-width="4" fill="none"/>
          <circle cx="430" cy="110" r="20" fill="none" stroke="#7cf7d2" stroke-width="4"/>
          <path d="M418 110 h10 l8 -12" stroke="#7cf7d2" stroke-width="4" fill="none"/>
          <path d="M320 110 H410" stroke="#9fdcff" stroke-width="4" fill="none"/>
          <path d="M180 60 l12 -18 l12 36 l12 -36 l12 36 l12 -36 l12 18" stroke="#ffd36f" stroke-width="4" fill="none"/>
          <text x="50" y="28" fill="#ffffff" font-size="18" font-weight="700">Transistor Switch</text>
          <text x="178" y="95" fill="#ffd36f" font-size="14">Base resistor</text>
          <text x="276" y="206" fill="#ff8ad6" font-size="14">NPN transistor</text>
          <text x="396" y="86" fill="#7cf7d2" font-size="14">Load</text>
        </svg>
      `
    },
    {
      title: "555 Timer Output Circuit",
      description: "This simple timer example represents a 555 timer driving an LED output, showing how an IC can create pulses or timed switching.",
      purpose: "Purpose: timing and pulse generation with an integrated circuit.",
      diagram: `
        <svg viewBox="0 0 520 220" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="555 timer circuit">
          <rect width="520" height="220" fill="#102038"/>
          <rect x="170" y="50" width="140" height="120" rx="8" fill="none" stroke="#ff8ad6" stroke-width="4"/>
          <text x="208" y="116" fill="#ff8ad6" font-size="28" font-weight="800">555</text>
          <path d="M60 90 H170" stroke="#9fdcff" stroke-width="4" fill="none"/>
          <path d="M310 110 H390" stroke="#9fdcff" stroke-width="4" fill="none"/>
          <circle cx="422" cy="110" r="20" fill="none" stroke="#7cf7d2" stroke-width="4"/>
          <path d="M410 110 h10 l8 -12" stroke="#7cf7d2" stroke-width="4" fill="none"/>
          <path d="M442 110 H470 V40 H60 V90" stroke="#9fdcff" stroke-width="4" fill="none"/>
          <path d="M60 150 H170" stroke="#9fdcff" stroke-width="4" fill="none"/>
          <path d="M60 150 V190 H470 V110" stroke="#9fdcff" stroke-width="4" fill="none"/>
          <text x="50" y="28" fill="#ffffff" font-size="18" font-weight="700">555 Timer + LED Output</text>
          <text x="326" y="88" fill="#7cf7d2" font-size="14">LED output</text>
          <text x="74" y="82" fill="#9fdcff" font-size="13">Trigger / supply path</text>
        </svg>
      `
    }
  ];
}

function renderPassiveCircuits(moduleData) {
  const section = document.getElementById("moduleCircuitsSection");
  const title = document.getElementById("moduleCircuitsTitle");
  const chip = document.getElementById("moduleCircuitsChip");
  const grid = document.getElementById("moduleCircuitsGrid");
  const note = document.getElementById("moduleCircuitsNote");

  if (!section || !title || !chip || !grid || !note) return;

  if (moduleData.title !== "Passive Components") {
    section.hidden = true;
    grid.innerHTML = "";
    return;
  }

  const cards = getPassiveCircuitCards();
  section.hidden = false;
  title.textContent = "Sample Circuit Diagrams";
  chip.textContent = `${cards.length} circuit examples`;
  note.textContent =
    "These simple circuit examples show how passive components are commonly used for current limiting, timing, filtering, and adjustable control.";

  grid.innerHTML = cards.map((card) => `
    <article class="module-circuit-card">
      <h3>${card.title}</h3>
      <div class="module-circuit-diagram">${card.diagram}</div>
      <p>${card.description}</p>
      <p>${card.purpose}</p>
    </article>
  `).join("");
}

function renderActiveCircuits(moduleData) {
  const section = document.getElementById("moduleCircuitsSection");
  const title = document.getElementById("moduleCircuitsTitle");
  const chip = document.getElementById("moduleCircuitsChip");
  const grid = document.getElementById("moduleCircuitsGrid");
  const note = document.getElementById("moduleCircuitsNote");

  if (!section || !title || !chip || !grid || !note) return;

  if (moduleData.title !== "Active Components") {
    return;
  }

  const cards = getActiveCircuitCards();
  section.hidden = false;
  title.textContent = "Sample Circuit Diagrams";
  chip.textContent = `${cards.length} circuit examples`;
  note.textContent =
    "These simple circuit examples show how active components are used for rectification, indication, switching, and timing.";

  grid.innerHTML = cards.map((card) => `
    <article class="module-circuit-card">
      <h3>${card.title}</h3>
      <div class="module-circuit-diagram">${card.diagram}</div>
      <p>${card.description}</p>
      <p>${card.purpose}</p>
    </article>
  `).join("");
}

function getMotherboardFormFactorCards() {
  return [
    {
      title: "ATX",
      kicker: "Standard Desktop Board",
      subtitle: "The lesson lists ATX as one of the common motherboard form factors.",
      boardSrc: "assets/modules/hardware/medium/module1/atx-motherboard.jpg",
      boardAlt: "ATX motherboard photo",
      boardLabel: "Actual motherboard photo",
      boardText: "ATX is the standard motherboard size commonly used in desktop computer systems.",
      description: "Use this container to remember the standard ATX layout before comparing it with the larger and smaller board formats."
    },
    {
      title: "E-ATX",
      kicker: "Larger Expansion Layout",
      subtitle: "The lesson also names E-ATX as a larger board layout.",
      boardSrc: "assets/modules/hardware/medium/module1/eatx-motherboard.jpg",
      boardAlt: "E-ATX motherboard photo",
      boardLabel: "Actual motherboard photo",
      boardText: "E-ATX is larger than ATX and is commonly used for high-end systems with more expansion space.",
      description: "Use this container to connect the idea of additional board space with the E-ATX form factor."
    },
    {
      title: "Micro-ATX",
      kicker: "Smaller Square Layout",
      subtitle: "The lesson includes Micro-ATX as a more compact motherboard size.",
      boardSrc: "assets/modules/hardware/medium/module1/micro-atx-motherboard.png",
      boardAlt: "Micro-ATX motherboard photo",
      boardLabel: "Actual motherboard photo",
      boardText: "Micro-ATX is a smaller square motherboard format used in more compact desktop systems.",
      description: "Use this container to remember that Micro-ATX keeps the motherboard's main functions in a smaller layout."
    },
    {
      title: "Mini-ITX",
      kicker: "Compact System Layout",
      subtitle: "The lesson names Mini-ITX as the compact form factor for space-saving builds.",
      boardSrc: "assets/modules/hardware/medium/module1/mini-itx-motherboard.png",
      boardAlt: "Mini-ITX motherboard photo",
      boardLabel: "Actual motherboard photo",
      boardText: "Mini-ITX is a compact motherboard form factor designed for space-saving builds.",
      description: "Use this container to connect compact computer cases with the Mini-ITX motherboard format."
    }
  ];
}

function renderMotherboardFormFactors(moduleData) {
  const section = document.getElementById("moduleFormFactorSection");
  const grid = document.getElementById("moduleFormFactorGrid");
  const chip = document.getElementById("moduleFormFactorChip");
  const note = document.getElementById("moduleFormFactorNote");

  if (!section || !grid || !chip || !note) return;

  const shouldRender =
    subject === "hardware" &&
    difficulty === "medium" &&
    moduleKey === "module1" &&
    moduleData.title === "Motherboard";

  if (!shouldRender) {
    section.hidden = true;
    grid.innerHTML = "";
    return;
  }

  const cards = getMotherboardFormFactorCards();
  section.hidden = false;
  chip.textContent = `${cards.length} form factors`;
  note.textContent =
    "Each form factor is placed in its own container so the board type is easier to compare one by one.";

  grid.innerHTML = cards.map((card) => `
    <article class="module-form-factor-card">
      <div class="module-form-factor-head">
        <div class="module-form-factor-title-group">
          <span class="module-form-factor-kicker">${card.kicker}</span>
          <h3 class="module-form-factor-title">${card.title}</h3>
          <p class="module-form-factor-subtitle">${card.subtitle}</p>
        </div>
        <span class="module-form-factor-pill">Form Factor</span>
      </div>
      <div class="module-form-factor-media">
        <div class="module-form-factor-panel">
          <img src="${card.boardSrc}" alt="${card.boardAlt}" loading="lazy" decoding="async">
          <div class="module-form-factor-panel-copy">
            <p class="module-form-factor-label">${card.boardLabel}</p>
            <p class="module-form-factor-text">${card.boardText}</p>
          </div>
        </div>
      </div>
      <div class="module-form-factor-footer">
        <p>${card.description}</p>
      </div>
    </article>
  `).join("");
}

function getTroubleshootingSteps() {
  return [
    {
      title: "Step 1: Check the power path",
      text: "Confirm the outlet, power cable, PSU switch, and front-panel connection before assuming a deeper hardware fault."
    },
    {
      title: "Step 2: Observe POST and startup clues",
      text: "Watch for beep codes, screen messages, fan spin, and indicator lights because they help narrow the possible failed part."
    },
    {
      title: "Step 3: Check for overheating symptoms",
      text: "Look for shutdowns, heavy fan noise, lag, or restart loops that may point to poor airflow, dust, or cooling failure."
    },
    {
      title: "Step 4: Trace storage and boot problems",
      text: "Inspect SATA or storage connections, boot order, BIOS detection, and drive condition when the system cannot find the operating system."
    }
  ];
}

function renderTroubleshootingSteps(images, gallery, galleryChip, galleryNote) {
  const steps = getTroubleshootingSteps();
  gallery.classList.add("module-gallery-grid-single");
  galleryChip.textContent = `${steps.length} troubleshooting steps`;
  galleryNote.textContent =
    "Follow these steps in order to diagnose common computer hardware faults more systematically.";

  gallery.innerHTML = images.map((image, index) => {
    const step = steps[index] || {
      title: `Step ${index + 1}`,
      text: image.info || "Review the symptom, test the likely cause, and confirm the result before moving on."
    };

    return `
      <article class="module-step-card">
        <div class="module-step-media">
          <img src="${image.src}" alt="${image.alt || image.caption || "Troubleshooting step"}" loading="lazy" decoding="async">
        </div>
        <div class="module-step-copy">
          <span class="module-step-index">Step ${index + 1}</span>
          <h3 class="module-step-title">${step.title}</h3>
          <p class="module-step-text">${step.text}</p>
          <div class="module-step-caption">${image.caption || ""}</div>
          <p class="module-step-note">${image.info || ""}</p>
        </div>
      </article>
    `;
  }).join("");
}

function renderModuleImages(images, gallery, galleryChip, galleryNote, moduleData = null) {
  const gallerySection = document.getElementById("moduleGallerySection");
  gallery.innerHTML = "";
  gallery.classList.remove("module-gallery-grid-single");

  if (
    moduleData?.title === "History" ||
    (moduleData?.title === "Troubleshooting" && images.length === 0)
  ) {
    if (gallerySection) {
      gallerySection.hidden = true;
    }
    return;
  }

  if (gallerySection) {
    gallerySection.hidden = false;
  }

  if (!images.length) {
    galleryChip.textContent = "No module images";
    gallery.innerHTML = `
      <div class="module-gallery-placeholder">
        This lesson does not currently have embedded reference images. The module can still be completed using the lesson brief, objectives, and challenge.
      </div>
    `;
    galleryNote.textContent =
      "When a source document includes visuals, they appear here as part of the lesson flow.";
    return;
  }

  const galleryImages = images.filter((image) => {
    if (image.caption === "Computer history timeline") {
      return false;
    }

    if (
      subject === "hardware" &&
      difficulty === "medium" &&
      moduleKey === "module1" &&
      [
        "ATX form factor",
        "E-ATX form factor",
        "Micro-ATX form factor",
        "Mini-ITX form factor"
      ].includes(image.caption)
    ) {
      return false;
    }

    return true;
  });

  if (!galleryImages.length) {
    galleryChip.textContent = "No gallery images";
    gallery.innerHTML = `
      <div class="module-gallery-placeholder">
        This part of the lesson uses the dedicated timeline section instead of a regular image gallery.
      </div>
    `;
    galleryNote.textContent =
      "Additional lesson visuals appear here when they are separate from the timeline view.";
    return;
  }

  galleryChip.textContent = `${galleryImages.length} image${galleryImages.length === 1 ? "" : "s"} ready`;
  galleryNote.textContent =
    "These visuals are shown as part of the lesson to match the original module material.";

  if (moduleKey === "module1" && subject === "hardware" && difficulty === "hard") {
    renderTroubleshootingSteps(galleryImages, gallery, galleryChip, galleryNote);
    return;
  }

  galleryImages.forEach((image) => {
    const figure = document.createElement("figure");
    figure.className = "module-figure";
    figure.innerHTML = `
      <img src="${image.src}" alt="${image.alt || "Module image"}" loading="lazy" decoding="async">
      <figcaption>
        <span class="module-figure-title">${image.caption || ""}</span>
        <span class="module-figure-info">${image.info || ""}</span>
      </figcaption>
    `;
    gallery.appendChild(figure);
  });
}

/* =========================
   NAVIGATION
========================= */
window.goBackToLevels = function () {
  window.location.href = `module-levels.html?subject=${subject}&difficulty=${difficulty}`;
};

window.startQuiz = async function () {
  await maybeAutoCompleteModule();
  window.location.href = getNextModuleUrl();
};

/* =========================
   THEME SYSTEM
========================= */
function loadTheme() {
  const saved = localStorage.getItem("theme");

  if (saved === "light") {
    document.body.classList.add("light-mode");
  }

  updateIcon();
}

window.toggleTheme = function () {
  document.body.classList.toggle("light-mode");

  const mode = document.body.classList.contains("light-mode") ? "light" : "dark";
  localStorage.setItem("theme", mode);

  updateIcon();
  restartThemeMusic();
};

function updateIcon() {
  const icon = document.getElementById("themeIcon");
  if (!icon) return;

  icon.textContent = document.body.classList.contains("light-mode") ? "☀️" : "🌙";
}

function updateIcon() {
  const icon = document.getElementById("themeIcon");
  if (!icon) return;
  icon.textContent = document.body.classList.contains("light-mode") ? "\u2600\uFE0F" : "\uD83C\uDF19";
}

/* RUN */
loadTheme();
renderModulePage();

initSounds();
initGlobalClickSound();
tryStartMusic();

document.body.addEventListener("click", () => {
  tryStartMusic();
}, { once: true });

