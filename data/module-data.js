export const MODULE_STRUCTURE = {
  electrical: {
    easy: 3,
    medium: 3,
    hard: 4
  },
  hardware: {
    easy: 3,
    medium: 3,
    hard: 2
  }
};

export const MODULE_CATALOG = {
  electrical: {
    easy: {
      module1: {
        title: "Introduction to Electricity and Electronics",
        content: `Electricity is a fundamental form of energy that powers many of the tools, appliances, and machines used every day. At its core, electricity comes from the movement of electrons, which are negatively charged particles found in atoms. Atoms contain protons, neutrons, and electrons. When electrons are forced to move from one atom to another, electric charge or electric current is produced.

Electricity works best when electrons move through conductors such as copper, aluminum, and silver. A working circuit usually needs a source, a path, a load, and sometimes a switch to control the flow. When the circuit is closed, electrons flow through the conductor and the load, then return to the source.

This lesson also introduces the two main forms of electricity. Static electricity is electricity at rest, often caused by an imbalance of charges on a material's surface. Current electricity is the continuous flow of electrons through a conductor and is the type used in homes, schools, industries, and devices. Students also meet direct current (DC), which flows in one direction, and alternating current (AC), which reverses direction periodically.

Electricity is important because it supports lighting, heating and cooling, communication, transportation, and medical equipment. Studying electricity and electronics builds the foundation for work in electrical engineering, construction, appliance servicing, computer systems, telecommunications, renewable energy, robotics, and automation.`,
        tip: "Focus first on the movement of electrons, then connect that idea to conductors, circuits, and static electricity.",
        images: []
      },
      module2: {
        title: "Personal Protective Equipment (PPE)",
        content: `Personal Protective Equipment, or PPE, is a vital line of defense when working with electricity. It helps protect workers and students from electric shock, arc flash burns, falling hazards, loud noise, and flying debris. Because electricity is invisible and fast-acting, even a brief contact with a live conductor can cause serious injury or death.

This lesson introduces common PPE used in electrical work, including insulated gloves, safety goggles or face shields, rubber-soled boots, flame-resistant clothing, hard hats, and hearing protection. Each item has a specific purpose, such as protecting the hands from live conductors, shielding the eyes from sparks, or insulating the body from the ground.

PPE should always match the task and the level of risk. It must be inspected before use for cracks, wear, or other damage, and it should only be used if it is properly rated for electrical work. PPE does not replace safe procedures, but it works together with correct techniques, lockout and tagout practices, and careful planning to reduce injury.`,
        tip: "Study each PPE item by matching it to the hazard it helps prevent.",
        images: []
      },
      module3: {
        title: "Tools for Electrical Work",
        content: `Using the right tool is an essential part of safe and accurate electrical work. The correct tool makes a task easier, improves precision, and lowers the risk of injury or equipment damage. The wrong tool can damage parts, cause poor electrical connections, or expose the worker to shock.

This module covers essential electrical hand tools and testing tools. Students are introduced to insulated screwdrivers, combination pliers, wire strippers, needle-nose pliers, fish tape, electrician's knives, crimping tools, multimeters, clamp meters, and voltage testers. Each tool is paired with a real purpose, such as stripping insulation, gripping wires in tight spaces, measuring voltage or current, or pulling conductors through conduits.

The lesson also emphasizes safe tool use. Tools with insulated handles rated for electrical work should be used whenever electricity is involved, especially when working near live circuits. Good tool selection is part of good electrical practice.`,
        tip: "Try to remember each tool by pairing its name with one real job it performs.",
        images: []
      }
    },
    medium: {
      module1: {
        title: "Basic Electrical Quantities",
        content: `Before working with electrical circuits, students need to understand four basic electrical quantities: voltage, current, resistance, and power. Voltage is the electrical pressure that pushes electrons through a circuit. Current is the flow of electrons through a conductor. Resistance is the opposition to that flow, and power is the rate at which electrical energy is used or converted into heat, light, motion, or another form.

This lesson also connects each quantity to its unit and measuring tool. Voltage is measured in volts using a voltmeter. Current is measured in amperes using an ammeter. Resistance is measured in ohms using an ohmmeter or a multimeter. Power is measured in watts and is commonly calculated using the formula P = V x I.

The module then introduces Ohm's Law, one of the most important principles in electricity. Ohm's Law explains the relationship between voltage, current, and resistance using the formula V = I x R. Students learn how to rearrange it to solve for current or resistance and how to apply it in circuit problems. Real examples show how Ohm's Law is used in LED circuits, home wiring, automotive repair, and solar setups.`,
        tip: "Memorize the symbol, unit, and meaning of each quantity together, not separately.",
        images: []
      },
      module2: {
        title: "Direct Current (DC) vs. Alternating Current (AC)",
        content: `Electricity can flow in two main ways: direct current and alternating current. Direct current, or DC, flows in one direction only. It has constant polarity and is commonly supplied by batteries, solar panels, power banks, USB ports, and many small electronic systems. Devices like flashlights, remote-control toys, and battery-powered gadgets rely on DC.

Alternating current, or AC, reverses direction periodically. In most systems this happens 50 or 60 times per second, which is called frequency. AC is the form used in household outlets, large appliances, and power distribution systems. Its waveform is commonly shown as a sine wave, while DC is often shown as a straight line.

This lesson compares the flow direction, sources, uses, and practical advantages of both systems. A major reason AC is used in homes and power distribution is that it can be stepped up or stepped down easily using transformers. That makes long-distance transmission more efficient. DC, on the other hand, is easy to store and ideal for low-voltage electronic devices.`,
        tip: "Compare DC and AC by source, direction of flow, and common application.",
        images: []
      },
      module3: {
        title: "Types of Wires and Cables",
        content: `This lesson begins with the difference between a wire and a cable. A wire is a single electrical conductor that may be solid or stranded. A cable is made of two or more wires grouped together inside a protective sheath. Understanding that difference helps students recognize the correct material for each type of installation.

The module introduces common wire and cable types such as THHN, Romex, UF cable, coaxial cable, twisted pair cable, MTW, XHHW, MC cable, armored cable, and fiber optic cable. Each one is linked to its typical use, such as residential outlets, underground installations, industrial equipment, data transmission, or exposed commercial runs.

The lesson also explains wire gauge and insulation. Students learn that smaller AWG numbers mean thicker conductors, and thicker conductors can safely carry more current. The module shows why choosing the correct gauge matters for safety, efficiency, and code compliance. It also introduces insulation materials such as PVC, rubber, XLPE, and Teflon or PTFE, along with their roles in protecting against shock, heat, moisture, and short circuits.`,
        tip: "Study each wire or cable type by linking its structure to its best application.",
        images: []
      }
    },
    hard: {
      module1: {
        title: "Wiring Methods",
        content: `Wiring methods are the systems used to install electrical conductors safely and efficiently in buildings, industrial plants, and outdoor environments. Choosing the correct method depends on the location, the electrical load, code requirements, protection from damage, and future maintenance access.

This lesson covers common wiring methods including conduit wiring, cable tray systems, raceways, direct burial wiring, armored cable, flexible metal conduit, and metal-clad cable. Students learn what each method looks like, where it is typically used, and why one method may be chosen over another in commercial, industrial, classroom, or outdoor settings.

The module also explains types of electrical connections. Series connections place components end to end so the same current flows through each one, while parallel connections create separate current paths so devices can work independently. Splice connections such as pigtail, Western Union, T-tap, and butt splices are also introduced so students can connect wiring methods to real-world installation and repair work.`,
        tip: "Think about each wiring method in terms of where it is used and what problem it solves.",
        images: []
      },
      module2: {
        title: "Soldering and Desoldering Techniques",
        content: `Soldering is the process of joining two or more metal parts by melting solder into the joint to create a strong electrical and mechanical connection. It is widely used in electronics assembly, repair work, circuit prototyping, and wire joining. A good soldered joint helps keep resistance low and circuit operation stable.

This lesson introduces the tools and materials needed for soldering, including the soldering iron, solder wire, flux, helping hands, a soldering stand, and safety gear. Students are guided through the standard steps: stripping insulation, applying flux, tinning the tip, heating the joint, applying solder, cooling the joint, and inspecting the final result. The lesson also explains what makes a joint strong and how to recognize a bad or cold solder joint.

Desoldering is presented as the reverse process used to remove solder for repairs, corrections, and part replacement. The module introduces desoldering pumps, desoldering braid, and hot air rework stations, along with safety reminders about ventilation, heat, eye protection, and careful handling of hot tools.`,
        tip: "Focus on the purpose of each soldering tool and the qualities of a good electrical joint.",
        images: []
      },
      module3: {
        title: "Passive Components",
        content: `Passive components are electronic parts that do not generate energy on their own. Instead, they resist, store, or filter electrical energy. This lesson focuses on the three most common passive components: resistors, capacitors, and inductors.

Resistors limit current or divide voltage in a circuit. Students are introduced to resistor types such as carbon film, wire-wound, metal film, potentiometers, and surface-mount resistors. The lesson also explains the resistor color code system and shows how to read values and tolerance from resistor bands.

Capacitors store and release electrical energy using an electric field between two conductive plates. The lesson distinguishes between polarized and non-polarized capacitors and introduces common types such as electrolytic, ceramic, film, tantalum, and supercapacitors. Inductors, meanwhile, store energy in a magnetic field when current flows through a coil. Students learn the basic idea behind air-core, ferrite-core, and iron-core inductors and how inductors resist sudden changes in current.`,
        tip: "Learn passive components by asking what each one does to energy in a circuit.",
        images: []
      },
      module4: {
        title: "Active Components",
        content: `Active components are parts that control the flow of electricity and require a power source to operate. This lesson introduces three major groups: diodes, transistors, and integrated circuits.

Diodes allow current to flow in only one direction and are commonly used for protection and rectification. The lesson includes rectifier diodes, Zener diodes, and LEDs, along with example uses such as AC-to-DC conversion, voltage regulation, and light emission. Transistors are presented as switches or amplifiers. Students learn the basic difference between NPN and PNP transistors and how these parts are used to turn loads on and off or increase weak signals.

The module also introduces integrated circuits, or ICs, which contain many components inside one small package. Examples include the 555 timer, 7400 series logic ICs, and the LM324 operational amplifier. The lesson closes by connecting these active components to switches, relays, and connectors so students can see how active devices work together inside real electronic systems.`,
        tip: "Separate each active component by its job: direction control, switching, amplification, or integrated processing.",
        images: []
      }
    }
  },
  hardware: {
    easy: {
      module1: {
        title: "Parts of the Computer and Input Output Devices",
        content:
          "This lesson introduces common external and internal computer parts. It covers input and output devices such as the monitor, mouse, and keyboard, along with important hardware like the AVR, system unit, chassis, PSU, HDD, ODD, RAM, ROM, BIOS chip, CMOS, and CPU. The goal is to help students recognize each part and understand its basic function inside the computer system.",
        tip: "Study each computer part by matching its name to its role in the system.",
        images: []
      },
      module2: {
        title: "Safety Tools",
        content:
          "This module explains the safety tools used during computer repair and servicing. It introduces PPE such as goggles, gloves, hard hats, boots, dust masks, and face shields, then discusses ESD protection tools like anti-static wrist straps, mats, and gloves. The lesson emphasizes that safety tools protect both the technician and sensitive computer components.",
        tip: "Remember that safety tools protect the person, while ESD tools mainly protect the components.",
        images: []
      },
      module3: {
        title: "OHS",
        content:
          "This lesson focuses on Occupational Health and Safety practices in the lab or workshop. It discusses safety procedures, correct behavior, workplace cleanliness, hazard prevention, and important do's and don'ts when using tools, handling chemicals, and working around electrical equipment. The module builds awareness of safe habits and responsible behavior during technical work.",
        tip: "Treat the do's and don'ts as habits that prevent accidents before they happen.",
        images: []
      }
    },
    medium: {
      module1: {
        title: "Motherboard",
        content:
          "This module focuses on the motherboard as the primary printed circuit board and communication center of the computer. It explains that the motherboard connects the CPU, memory, storage, expansion devices, firmware, and power regulation areas so the whole system can function as one unit. The lesson identifies the CPU socket, chipset, RAM slots, PCIe expansion slots, SATA and NVMe storage interfaces, VRM, jumpers, DIP switches, and CMOS battery, then connects them to compatibility, startup behavior, and safe assembly. It also covers socket types such as LGA, PGA, and BGA, the role of heatsinks and CPU fans in thermal management, the difference between RAM, ROM, and cache, firmware concepts like BIOS, UEFI, and POST, and common motherboard form factors such as ATX, E-ATX, Micro-ATX, and Mini-ITX.",
        tip: "Study the motherboard part by part: identify where each section is located, then connect that part to its function in startup, compatibility, power, storage, or cooling.",
        images: []
      },
      module2: {
        title: "Basic Computer Configuration Setup",
        content:
          "This lesson covers basic computer configuration setup in four parts: preparation and safety protocols, disassembly procedures, assembly and component installation, and post-assembly testing and troubleshooting. It explains the correct workspace conditions, essential tools, power safety, and ESD protection before hardware work begins. It also presents the proper reverse order for disassembly, the correct sequence for installing the motherboard, CPU, RAM, PSU, and front panel connections, and the common problems checked during POST such as beep codes, no power, sudden shutdowns, and missing storage.",
        tip: "Follow the source order exactly: prepare first, disassemble carefully, assemble in sequence, then perform POST and troubleshooting checks.",
        images: []
      },
      module3: {
        title: "Preventive Maintenance",
        content:
          "This module explains preventive maintenance as a regular and systematic inspection, cleaning, and replacement process used to keep computer parts, materials, and systems in good working order. It covers maintenance planning and procedures, the 5S principle, hardware cleaning practices, RAM seating and keying, screw management, troubleshooting-related component checks, and safety and software maintenance steps such as ESD protection and creating a System Restore Point before software work.",
        tip: "Stay with the maintenance flow from the source: plan first, clean correctly, check key components, then follow safety and software maintenance steps.",
        images: []
      }
    },
    hard: {
      module1: {
        title: "Troubleshooting",
        content:
          "This lesson covers the troubleshooting process and common hardware faults in computer systems. It discusses problem identification, theory building, testing, and diagnosis of failures involving the PSU, motherboard, CPU overheating, RAM, storage devices, SATA cables, BIOS issues, and intermittent faults. The module helps students classify symptoms and connect them to practical repair strategies.",
        tip: "Always connect the symptom to the most probable hardware cause before trying fixes.",
        images: []
      },
      module2: {
        title: "History",
        content:
          "This module introduces important inventors and milestones in computer history. It includes figures such as Charles Babbage, Ada Lovelace, Alan Turing, Konrad Zuse, Grace Hopper, Tim Berners-Lee, Robert Metcalfe, and John Von Neumann, along with the inventions and ideas that shaped modern computing. The lesson builds historical awareness of how computer technology developed over time.",
        tip: "Group inventors by what they contributed: mechanical computers, programming, networking, or modern architecture.",
        images: []
      }
    }
  }
};
