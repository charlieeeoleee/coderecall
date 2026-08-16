const ASSET_ROOT = "assets/modules/hardware/easy/module2";

export const HARDWARE_EASY_MODULE2_CATEGORIES = Object.freeze([
  Object.freeze({ categoryId: "personal-protective-equipment", categoryLabel: "Personal Protective Equipment", subtitle: "" }),
  Object.freeze({ categoryId: "esd-tools", categoryLabel: "ESD Tools", subtitle: "" }),
  Object.freeze({ categoryId: "cleaning-tools", categoryLabel: "Cleaning Tools", subtitle: "" })
]);

function entry({ semanticId, categoryId, categoryLabel, title, description, file, alt, pdfPage, provenanceNote = "Direct visual match to the authoritative Module 2 PDF." }) {
  return Object.freeze({
    semanticId,
    categoryId,
    categoryLabel,
    title,
    description,
    image: `${ASSET_ROOT}/${file}`,
    alt,
    videoUrl: null,
    pdfPage,
    provenanceNote
  });
}

export const HARDWARE_EASY_MODULE2_CONTENT = Object.freeze([
  entry({ semanticId: "ppe-safety-goggles", categoryId: "personal-protective-equipment", categoryLabel: "Personal Protective Equipment", title: "Safety Goggles", description: "Protects the eyes from small particles or debris.", file: "image-06.png", alt: "Clear protective safety goggles with a red and gray frame and black head strap.", pdfPage: 1 }),
  entry({ semanticId: "ppe-hard-hat", categoryId: "personal-protective-equipment", categoryLabel: "Personal Protective Equipment", title: "Hard Hat", description: "Protects the head from fallen objects.", file: "image-04.png", alt: "Orange protective hard hat with an adjustable chin strap.", pdfPage: 1 }),
  entry({ semanticId: "ppe-safety-earplugs", categoryId: "personal-protective-equipment", categoryLabel: "Personal Protective Equipment", title: "Safety Earplugs", description: "Provides extra ear protection when using loud power tools.", file: "image-11.png", alt: "Pair of orange foam earplugs connected by a blue cord.", pdfPage: 1 }),
  entry({ semanticId: "ppe-safety-vest", categoryId: "personal-protective-equipment", categoryLabel: "Personal Protective Equipment", title: "Safety Vest", description: "A visibility vest for dark places because it reflects light.", file: "image-07.png", alt: "Orange high-visibility safety vest with reflective gray strips.", pdfPage: 1 }),
  entry({ semanticId: "ppe-safety-gloves", categoryId: "personal-protective-equipment", categoryLabel: "Personal Protective Equipment", title: "Safety Gloves", description: "Protects the hands from sharp objects that might cause harm.", file: "image-16.png", alt: "Pair of heavy yellow and beige protective work gloves.", pdfPage: 2 }),
  entry({ semanticId: "ppe-dust-mask", categoryId: "personal-protective-equipment", categoryLabel: "Personal Protective Equipment", title: "Dust Mask", description: "Protects the nose and lungs from hazardous chemicals that may be inhaled.", file: "image-01.png", alt: "White disposable respirator mask beside a black full-face respirator.", pdfPage: 2, provenanceNote: "The authoritative PDF titles this entry Dust Mask while its source image shows both a disposable respirator and a full-face respirator." }),
  entry({ semanticId: "ppe-safety-harness", categoryId: "personal-protective-equipment", categoryLabel: "Personal Protective Equipment", title: "Safety Harness", description: "Protects against falling from high places by serving as a safety harness.", file: "image-17.png", alt: "Full-body safety harness with shock-absorbing lanyard, rope, and metal hooks.", pdfPage: 2 }),
  entry({ semanticId: "ppe-safety-boots", categoryId: "personal-protective-equipment", categoryLabel: "Personal Protective Equipment", title: "Safety Boots", description: "Protects the feet from slipping or stepping on sharp objects.", file: "image-05.png", alt: "Pair of tall yellow protective safety boots with black slip-resistant soles.", pdfPage: 3 }),
  entry({ semanticId: "ppe-face-shield", categoryId: "personal-protective-equipment", categoryLabel: "Personal Protective Equipment", title: "Face Shield", description: "Protects the face from flying objects such as dust, debris, or small sharp objects.", file: "image-13.png", alt: "Clear full-face safety shield attached to a black adjustable head frame.", pdfPage: 3 }),

  entry({ semanticId: "esd-anti-static-wrist-trap", categoryId: "esd-tools", categoryLabel: "ESD Tools", title: "Anti-Static Wrist Trap", description: "Prevents static that can damage computer components.", file: "image-03.png", alt: "Blue anti-static wrist band connected by a coiled grounding lead and metal clip.", pdfPage: 4, provenanceNote: "The authoritative PDF uses the exact title Anti-Static Wrist Trap; that source wording is intentionally preserved." }),
  entry({ semanticId: "esd-anti-static-mat", categoryId: "esd-tools", categoryLabel: "ESD Tools", title: "Anti-Static Mat", description: "Protects computer components when placed on a flat surface.", file: "image-10.png", alt: "Rolled blue anti-static work mat with metal grounding snaps.", pdfPage: 4 }),
  entry({ semanticId: "esd-anti-static-gloves", categoryId: "esd-tools", categoryLabel: "ESD Tools", title: "Anti-Static Gloves", description: "Prevents static charges passing from the hands to computer components.", file: "image-09.png", alt: "Gray anti-static gloves handling a mobile device while connected to a blue wrist grounding strap.", pdfPage: 4, provenanceNote: "The ESD identity of the pictured gloves is established by the authoritative PDF title and context." }),
  entry({ semanticId: "esd-anti-static-bag", categoryId: "esd-tools", categoryLabel: "ESD Tools", title: "Anti-Static Bag", description: "Stores computer components when they need to be stored or depose[d].", file: "image-14.png", alt: "Static-shielding bag containing a computer hard drive with an electrostatic warning label.", pdfPage: 4, provenanceNote: "The unusual source wording depose[d] is preserved without interpreting it as disposal, deposit, or transport." }),

  entry({ semanticId: "cleaning-lint-free-cloth", categoryId: "cleaning-tools", categoryLabel: "Cleaning Tools", title: "Lint Free Cloth", description: "Cleans or wipes delicate parts or surfaces, commonly screens.", file: "image-02.png", alt: "Two folded blue lint-free cleaning cloths.", pdfPage: 4 }),
  entry({ semanticId: "cleaning-compressed-air", categoryId: "cleaning-tools", categoryLabel: "Cleaning Tools", title: "Compressed Air", description: "Blows dirt or dust from computer components or hard-to-clean areas.", file: "image-12.png", alt: "Can of electronics compressed-gas duster with a narrow red nozzle.", pdfPage: 5 }),
  entry({ semanticId: "cleaning-cable-ties", categoryId: "cleaning-tools", categoryLabel: "Cleaning Tools", title: "Cable Ties", description: "Organizes cables or wires and keeps them in place.", file: "image-15.png", alt: "Assortment of black and white plastic cable ties.", pdfPage: 5 }),
  entry({ semanticId: "cleaning-part-organizer", categoryId: "cleaning-tools", categoryLabel: "Cleaning Tools", title: "Part Organizer", description: "Stores computer hardware parts or screws.", file: "image-08.png", alt: "Orange and black parts organizer with multiple transparent removable drawers.", pdfPage: 5 })
]);
