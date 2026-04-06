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
        content:
          "This lesson introduces electricity as a form of energy created by the movement of electrons. It explains the basic parts of the atom, how electric current is produced, how conductors allow electricity to flow, and what a working circuit needs: a source, a path, and a load. It also introduces static electricity and helps students connect the idea of electric charge to everyday experiences.",
        tip: "Focus first on the movement of electrons, then connect that idea to conductors, circuits, and static electricity.",
        images: []
      },
      module2: {
        title: "Personal Protective Equipment (PPE)",
        content:
          "This module explains why PPE is a critical safety requirement in electrical work. It covers how protective clothing, insulated gear, and safety equipment reduce the risk of electric shock, arc flash burns, falling hazards, noise exposure, and flying debris. The lesson also introduces common PPE items such as insulated gloves, face shields, rubber-soled boots, and other protection used in electrical environments.",
        tip: "Study each PPE item by matching it to the hazard it helps prevent.",
        images: []
      },
      module3: {
        title: "Tools for Electrical Work",
        content:
          "This lesson introduces the essential hand tools and measuring tools used in electrical work. It explains the purpose of insulated screwdrivers, pliers, wire strippers, needle-nose pliers, multimeters, and clamp meters, while stressing that correct tool use improves safety, efficiency, and accuracy. It also helps students understand when each tool should be used in actual electrical tasks.",
        tip: "Try to remember each tool by pairing its name with one real job it performs.",
        images: []
      }
    },
    medium: {
      module1: {
        title: "Basic Electrical Quantities",
        content:
          "This module introduces the four core electrical quantities: voltage, current, resistance, and power. It explains what each quantity means, how each one behaves inside a circuit, the units used to measure them, and the instruments commonly used to test them. The lesson builds the foundation students need before solving circuit problems or using electrical measuring tools.",
        tip: "Memorize the symbol, unit, and meaning of each quantity together, not separately.",
        images: []
      },
      module2: {
        title: "Direct Current (DC) vs. Alternating Current (AC)",
        content:
          "This lesson compares the two main ways electricity flows. It explains how direct current moves in one direction while alternating current reverses direction repeatedly. The module also covers common sources of DC and AC, their basic characteristics, and where each type of current is commonly used in real devices, household systems, and power distribution.",
        tip: "Compare DC and AC by source, direction of flow, and common application.",
        images: []
      },
      module3: {
        title: "Types of Wires and Cables",
        content:
          "This module explains the difference between a wire and a cable, then introduces common electrical wiring types such as THHN, Romex, UF cable, and coaxial cable. It emphasizes construction, protection, and typical applications so students can identify where each type is best used in residential, commercial, and outdoor setups.",
        tip: "Study each wire or cable type by linking its structure to its best application.",
        images: []
      }
    },
    hard: {
      module1: {
        title: "Wiring Methods",
        content:
          "This lesson covers the major wiring methods used in buildings, industrial spaces, and outdoor environments. It explains how conduit systems, cable tray systems, raceways, and other wiring approaches are selected based on environment, electrical load, regulations, accessibility, and safety. The module helps students understand why proper wiring method selection matters in real installations.",
        tip: "Think about each wiring method in terms of where it is used and what problem it solves.",
        images: []
      },
      module2: {
        title: "Soldering and Desoldering Techniques",
        content:
          "This module teaches the basics of making and removing permanent electrical connections. It explains the purpose of soldering, the tools and materials involved, and the importance of clean, stable, low-resistance joints in electronics and wiring work. It also introduces desoldering as a repair and rework skill used when components or wires must be removed safely.",
        tip: "Focus on the purpose of each soldering tool and the qualities of a good electrical joint.",
        images: []
      },
      module3: {
        title: "Passive Components",
        content:
          "This lesson introduces passive electronic components that do not generate energy but instead resist, store, or filter it. It focuses on resistors, capacitors, and inductors, including their functions, symbols, units, and common uses in circuits. The module helps students understand how passive parts shape current, voltage, timing, and energy behavior in electronics.",
        tip: "Learn passive components by asking what each one does to energy in a circuit.",
        images: []
      },
      module4: {
        title: "Active Components",
        content:
          "This module covers active components that control electrical flow and require power to operate. It introduces diodes, transistors, and integrated circuits, explains how they guide or amplify current, and gives examples of how they are used in practical electronic systems. The lesson helps students distinguish active components from passive ones by function and behavior.",
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
