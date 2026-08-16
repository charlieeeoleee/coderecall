const ASSET_ROOT = "assets/modules/hardware/medium/module2";

function section(semanticId, heading, points) {
  return Object.freeze({
    semanticId,
    heading,
    rules: Object.freeze([...points])
  });
}

export const HARDWARE_MEDIUM_MODULE2_LESSON = Object.freeze({
  sourceTitle: "Basic Computer Configuration Setup",
  titleStatus: "Source-supported normalized title; the PDF does not present a standalone title heading.",
  introduction: "In order to begin simple work using a computer, we should first build our system unit and complete a basic computer configuration setup.",
  objectives: Object.freeze([
    "Prepare a suitable workspace and follow the power and ESD precautions stated in the lesson",
    "Follow the source order for safe disassembly and component installation",
    "Use POST and the listed symptoms to check the computer after assembly"
  ]),
  sections: Object.freeze([
    section("preparation-safety", "Preparation and Safety Protocols", [
      "Workspace: Use a large, level, well-lit, and well-ventilated area. Avoid carpeted floors because they generate static electricity.",
      "Phillips-head screwdriver: Used for most internal screws.",
      "Flat-head screwdriver: The source identifies it as useful for prying open cases.",
      "Anti-static wrist strap: Used to prevent Electrostatic Discharge (ESD).",
      "Needle-nose pliers: Used for the bending or compression tasks named in the source.",
      "Power safety: Always unplug the power cord from the wall before touching an internal component.",
      "ESD protection: If an anti-static strap is unavailable, the lesson directs the learner to touch a grounded metal object, such as the PSU case, before handling parts.",
      "Never handle sensitive parts such as RAM on a carpeted floor without grounding."
    ]),
    section("disassembly-procedures", "Disassembly Procedures", [
      "Disassembly should follow a logical reverse order so that parts are not forced or damaged.",
      "Shut down the PC, allow it to cool for 15–30 minutes, and unplug all external cables.",
      "Remove the side panels first.",
      "Pull components such as sound cards and RAM straight out without twisting or bending them.",
      "The motherboard should generally be the final component removed from the system case.",
      "Use labeled containers to keep screws and small parts organized per unit and prevent mix-ups during reassembly."
    ]),
    section("assembly-installation", "Assembly and Component Installation", [
      "Strategic sequencing provides mechanical stability before electrical connections are made.",
      "Motherboard: Mount it using standoffs so it does not touch the metal case and cause a short circuit. Do not overtighten the screws because that can crack the board.",
      "CPU: Align it carefully in the socket. Incorrect installation can permanently damage the socket contacts.",
      "Apply thermal paste before installing the heatsink and fan.",
      "RAM: Align the notch on the DIMM with the slot key. The source specifically states that DDR modules are not compatible with DDR2 or DDR3 sockets.",
      "PSU: Mount the power supply, align it, secure it with screws, and then connect the internal power cables.",
      "Front panel: Attach the power-switch and LED connectors correctly to the motherboard so the system can power on."
    ]),
    section("post-assembly-testing", "Post-Assembly Testing and Troubleshooting", [
      "After assembly, the system must undergo a Power-On Self-Test (POST).",
      "Perform an initial powered test after connecting power to the motherboard to verify the installation and check that components were not damaged.",
      "Beep codes: The source says a single beep typically means all clear, while repeated beeps without a display indicate a POST error such as misaligned RAM or GPU. Actual beep meanings can depend on the system firmware.",
      "No power: First ensure that all internal and external connections are secure.",
      "Sudden shutdowns: The source associates a siren-like sound followed by shutdown with CPU overheating, such as a disconnected fan or poor thermal-paste application; the exact warning behavior depends on the system.",
      "Missing storage: Without a hard drive, the system may report boot or mount issues because it cannot find an operating system."
    ])
  ]),
  sourceReference: "Balana, I. M. (2019). Information sheet 1.1-4: Assemble computer (Version 1.1). Northern Zambales College."
});

function figure({ semanticId, sectionId, title, description, file, alt, pdfPage, provenanceType, sourceTitle, sourceUrl, creator, license, licenseUrl, provenanceNote }) {
  return Object.freeze({
    semanticId,
    sectionId,
    title,
    description,
    image: `${ASSET_ROOT}/${file}`,
    alt,
    videoUrl: null,
    pdfPage,
    provenanceType,
    sourceTitle,
    sourceUrl,
    creator,
    license,
    licenseUrl,
    provenanceNote,
    detailMode: "standard"
  });
}

export const HARDWARE_MEDIUM_MODULE2_CONTENT = Object.freeze([
  figure({
    semanticId: "preparation-safety-protocols",
    sectionId: "preparation-safety",
    title: "Preparation and Safety Protocols",
    description: "Prepare a suitable workspace, organize the required tools, disconnect power, and use ESD protection before handling computer components.",
    file: "image-01.png",
    alt: "Safety First composite showing a technician beside a laptop with warning, tool, checklist, and protection symbols.",
    pdfPage: 1,
    provenanceType: "pdf-derived",
    sourceTitle: "2. MEDIUM (Module 2).pdf",
    sourceUrl: null,
    creator: null,
    license: null,
    licenseUrl: null,
    provenanceNote: "Exact decoded-pixel match to the sole embedded figure in the authoritative Hardware Medium Module 2 PDF."
  }),
  figure({
    semanticId: "assembly-component-installation",
    sectionId: "assembly-installation",
    title: "Assembly and Component Installation",
    description: "Follow a stable installation sequence for the motherboard, processor, cooling, memory, power supply, and front-panel connections.",
    file: "assembly-component-installation.jpg",
    alt: "Close-up of a motherboard resting beside a computer case, showing expansion slots, a chipset heatsink, SATA connectors, capacitors, and circuit-board components.",
    pdfPage: null,
    provenanceType: "supplemental-open-license",
    sourceTitle: "Motherboard-come-si-monta.jpg",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Motherboard-come-si-monta.jpg",
    creator: "Whityya23",
    license: "CC0 1.0 Universal Public Domain Dedication",
    licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
    provenanceNote: "Open-license Wikimedia Commons photograph supporting the assembly section; not an extracted PDF figure."
  }),
  figure({
    semanticId: "internal-computer-configuration",
    sectionId: "assembly-installation",
    title: "Internal Computer Configuration",
    description: "Review how the motherboard, cooling hardware, memory, expansion cards, fans, cables, and case work together inside an assembled computer.",
    file: "internal-computer-configuration.jpg",
    alt: "Open desktop computer case showing its motherboard, large CPU heatsink, memory modules, expansion cards, illuminated cooling fans, drive connectors, and internal cables.",
    pdfPage: null,
    provenanceType: "supplemental-open-license",
    sourceTitle: "Ensemble PC.jpg",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Ensemble_PC.jpg",
    creator: "BloodMotion",
    license: "CC0 1.0 Universal Public Domain Dedication",
    licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
    provenanceNote: "Open-license Wikimedia Commons photograph supporting internal computer configuration; not an extracted PDF figure."
  }),
  figure({
    semanticId: "post-diagnostics-troubleshooting",
    sectionId: "post-assembly-testing",
    title: "POST Diagnostics and Troubleshooting",
    description: "A POST diagnostic card displays firmware progress codes that can help identify where startup testing stops while diagnosing a computer.",
    file: "post-diagnostics-troubleshooting.jpg",
    alt: "Black TL460s Plus POST diagnostic expansion card with two seven-segment displays and PCI, PCIe, and LPC connection sections.",
    pdfPage: null,
    provenanceType: "supplemental-open-license",
    sourceTitle: "BIOS POST card for PCI, PCIe and LPC bus.jpg",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:BIOS_POST_card_for_PCI,_PCIe_and_LPC_bus.jpg",
    creator: "Markus Kuhn",
    license: "CC0 1.0 Universal Public Domain Dedication",
    licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
    provenanceNote: "Open-license Wikimedia Commons photograph supporting the testing and troubleshooting section; not an extracted PDF figure."
  })
]);

export const HARDWARE_MEDIUM_MODULE2_HERO_IDS = Object.freeze([
  "preparation-safety-protocols",
  "assembly-component-installation",
  "post-diagnostics-troubleshooting"
]);
