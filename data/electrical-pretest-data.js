const electricalPretestSource = [
  {
    question: "What is the basic unit of electric current?",
    choices: ["Volt", "Ohm", "Ampere", "Watt"],
    answer: "Ampere",
    rationale: "Electric current is measured in ampere, which describes the rate of flow of electric charge through a conductor."
  },
  {
    question: "Which component opposes the flow of electric current?",
    choices: ["Capacitor", "Resistor", "Inductor", "Diode"],
    answer: "Resistor",
    rationale: "A resistor limits or opposes current flow in a circuit and helps control electrical behavior."
  },
  {
    question: "What does Ohm's Law state?",
    choices: [
      "Power is equal to voltage times current (P=VI).",
      "Voltage is equal to current times resistance (V=IR).",
      "Current is equal to voltage divided by resistance (I=V/R).",
      "Both b and c are correct."
    ],
    answer: "Both b and c are correct.",
    rationale: "Ohm's Law can be expressed in equivalent forms, including V = IR and I = V / R, depending on what quantity is being solved."
  },
  {
    question: "A device that stores electrical energy in an electric field is called a:",
    choices: ["Resistor", "Transistor", "Capacitor", "Battery"],
    answer: "Capacitor",
    rationale: "A capacitor stores energy in an electric field between conductive plates and can release that energy when needed."
  },
  {
    question: "What is the primary function of a diode?",
    choices: [
      "To amplify signals",
      "To store energy",
      "To allow current to flow in only one direction",
      "To convert AC to DC"
    ],
    answer: "To allow current to flow in only one direction",
    rationale: "A diode mainly permits current to pass in one direction while blocking it in the opposite direction."
  },
  {
    question: "Which of the following is a semiconductor material commonly used in electronics?",
    choices: ["Copper", "Gold", "Silicon", "Aluminum"],
    answer: "Silicon",
    rationale: "Silicon is widely used in electronics because its conductivity can be controlled, making it ideal for semiconductor devices."
  },
  {
    question: "What is the unit of electrical resistance?",
    choices: ["Ampere", "Volt", "Farad", "Ohm"],
    answer: "Ohm",
    rationale: "Electrical resistance is measured in ohms, which indicate how much a material resists current flow."
  },
  {
    question: "What does AC stand for in electronics?",
    choices: [
      "Alternating Current",
      "Amplified Current",
      "Advanced Circuit",
      "Automatic Control"
    ],
    answer: "Alternating Current",
    rationale: "AC means alternating current, where the direction of current flow changes periodically."
  },
  {
    question: "A device that can switch or amplify electronic signals is a:",
    choices: ["Transistor", "Resistor", "Capacitor", "Inductor"],
    answer: "Transistor",
    rationale: "A transistor is used for switching and amplification in many electronic circuits."
  },
  {
    question: "What is the unit of electrical power?",
    choices: ["Volt", "Ampere", "Watt", "Joule"],
    answer: "Watt",
    rationale: "Electrical power is measured in watts, which describe the rate at which electrical energy is used or transferred."
  },
  {
    question: "What are the three main parts of an atom?",
    choices: [
      "Protons, Electrons, and Ions",
      "Protons, Neutrons, and Electrons",
      "Neutrons, Nucleus, and Quarks",
      "Electrons, Photons, and Protons"
    ],
    answer: "Protons, Neutrons, and Electrons",
    rationale: "Atoms are mainly made of protons and neutrons in the nucleus, with electrons surrounding the nucleus."
  },
  {
    question: "Which material is considered an excellent conductor commonly used in electrical wiring?",
    choices: ["Rubber", "Glass", "Plastic", "Copper"],
    answer: "Copper",
    rationale: "Copper is an excellent conductor and is commonly used in wiring because it allows current to flow efficiently."
  },
  {
    question: "What is the unit of measurement for electrical resistance?",
    choices: ["Volt (V)", "Ampere (A)", "Ohm (Ω)", "Watt (W)"],
    answer: "Ohm (Ω)",
    rationale: "Resistance is measured in ohms, represented by the symbol Ω."
  },
  {
    question: "In Ohm's Law, what is the formula to find Voltage (V)?",
    choices: ["V = I × R", "V = R / I", "V = I / R", "V = P / I"],
    answer: "V = I × R",
    rationale: "Ohm's Law states that voltage is equal to current multiplied by resistance."
  },
  {
    question: "Which type of current flows in only one direction and is typically found in batteries?",
    choices: [
      "Alternating Current (AC)",
      "Static Current",
      "Direct Current (DC)",
      "Magnetic Current"
    ],
    answer: "Direct Current (DC)",
    rationale: "Direct current flows in one direction only and is commonly supplied by batteries."
  },
  {
    question: "What PPE item is made of thick rubber to provide a barrier against electric current?",
    choices: ["Safety goggles", "Insulated gloves", "Hard hat", "FR clothing"],
    answer: "Insulated gloves",
    rationale: "Insulated gloves help protect the user from electric shock by reducing contact with current."
  },
  {
    question: "What is the primary purpose of a Lockout/Tagout (LOTO) system?",
    choices: [
      "To measure voltage in a circuit",
      "To ensure electrical circuits stay OFF during maintenance",
      "To organize tools in a workshop",
      "To increase the speed of electrical flow"
    ],
    answer: "To ensure electrical circuits stay OFF during maintenance",
    rationale: "LOTO procedures are used to keep equipment de-energized and safe while maintenance or servicing is being done."
  },
  {
    question: "According to the 'One-Hand Rule,' where should your other hand be when working with live circuits?",
    choices: [
      "On the metal frame of machine",
      "Holding a secondary tool",
      "Behind your back or in your pocket",
      "Resting on the workbench"
    ],
    answer: "Behind your back or in your pocket",
    rationale: "The one-hand rule reduces the chance of current passing across the chest by keeping the other hand away from conductive contact."
  },
  {
    question: "What is the main difference between a wire and a cable?",
    choices: [
      "A wire is a single conductor; a cable is two or more wires in a sheath",
      "Wires are for AC, and cables are for DC",
      "Wires are made of plastic; cables are made of metal",
      "There is no difference between them"
    ],
    answer: "A wire is a single conductor; a cable is two or more wires in a sheath",
    rationale: "A wire typically refers to a single conductor, while a cable usually contains multiple conductors grouped together in protective sheathing."
  },
  {
    question: "Which AWG wire size is thicker and can carry more current?",
    choices: ["14 AWG", "24 AWG", "20 AWG", "10 AWG"],
    answer: "10 AWG",
    rationale: "In AWG sizing, a smaller number means a thicker wire, and thicker wires can generally carry more current."
  },
  {
    question: "What type of cable is specifically rated for underground use and resists moisture?",
    choices: ["Romex (NM)", "THHN", "UF (Underground Feeder)", "Coaxial"],
    answer: "UF (Underground Feeder)",
    rationale: "UF cable is designed for underground installation and has added protection against moisture exposure."
  },
  {
    question: "In which type of connection does the same current flow through every component?",
    choices: [
      "Parallel Connection",
      "Series Connection",
      "Splice Connection",
      "Ground Connection"
    ],
    answer: "Series Connection",
    rationale: "In a series circuit, the same current passes through each component because there is only one path for flow."
  },
  {
    question: "Which manual wire joint is used for strong, soldered joints in telecommunications?",
    choices: ["Western Union Splice", "Pigtail Splice", "T-Tap Splice", "Butt Splice"],
    answer: "Western Union Splice",
    rationale: "The Western Union splice is known for making a secure, strong connection, especially when soldered."
  },
  {
    question: "Electronic components that do not require an external power source to operate are called:",
    choices: [
      "Active components",
      "Digital components",
      "Passive components",
      "Integrated circuits"
    ],
    answer: "Passive components",
    rationale: "Passive components do not provide gain or require an external supply to perform their basic function."
  },
  {
    question: "What is the primary function of a resistor?",
    choices: [
      "To store electrical energy",
      "To limit or divide current",
      "To amplify signals",
      "To generate magnetic fields"
    ],
    answer: "To limit or divide current",
    rationale: "A resistor controls current flow and can also create voltage drops in a circuit."
  },
  {
    question: "Using the resistor color code, what is the value of a resistor with Red, Violet, and Brown bands?",
    choices: ["27 ohms", "270 ohms", "2,700 ohms", "2.7 ohms"],
    answer: "270 ohms",
    rationale: "The first two bands give the digits and the third band is the multiplier, resulting in 270 ohms."
  },
  {
    question: "Which component is designed to store and release electrical energy using conductive plates?",
    choices: ["Inductor", "Transistor", "Capacitor", "Diode"],
    answer: "Capacitor",
    rationale: "A capacitor stores electrical energy between conductive plates separated by a dielectric material."
  },
  {
    question: "What is the standard unit for capacitance?",
    choices: ["Henry (H)", "Farad (F)", "Ohm (Ω)", "Ampere (A)"],
    answer: "Farad (F)",
    rationale: "Capacitance is measured in farads, which indicate how much charge a capacitor can store per unit voltage."
  },
  {
    question: "Which tool is used to measure multiple electrical quantities like voltage, current, and resistance?",
    choices: ["Multimeter", "Voltmeter", "Ammeter", "Wattmeter"],
    answer: "Multimeter",
    rationale: "A multimeter combines several measurement functions and can test voltage, current, and resistance."
  },
  {
    question: "What does the 'Gold' band represent in the resistor color code system?",
    choices: ["10% Tolerance", "1% Tolerance", "20% Tolerance", "5% Tolerance"],
    answer: "5% Tolerance",
    rationale: "In resistor color coding, a gold tolerance band indicates that the resistor's actual value may vary by 5% from its stated value."
  }
];

export const electricalPretestQuestions = electricalPretestSource.map((question, index) => ({
  ...question,
  pairId: `electrical-${String(index + 1).padStart(2, "0")}`
}));
