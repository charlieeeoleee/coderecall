const ASSET_ROOT = "assets/modules/hardware/easy/module3";

function lessonSection(heading, rules) {
  return Object.freeze({ heading, rules: Object.freeze([...rules]) });
}

export const HARDWARE_EASY_MODULE3_LESSON = Object.freeze({
  sourceTitle: "OHS",
  sections: Object.freeze([
    lessonSection("Safety Lab Procedures", [
      "Always wear protective suits when doing a laboratory works",
      "Handle dangerous chemicals with care",
      "Avoid playing on the premises",
      "Avoid living the workplace area unattended",
      "Keep sharp objects or chemicals away from children",
      "Avoid storing hazardous chemicals in hot places"
    ]),
    lessonSection("Do’s", [
      "Follow rules and regulations",
      "Wear protective clothing",
      "Keep your workplace clean",
      "Keep away any liquids away from sockets",
      "Cover any sharp objects",
      "Use tools according to their functions to avoid injuries",
      "Check for possible hazards that might occur",
      "Be respectful with co workers",
      "Avoid any improper movements",
      "Conduct daily check ups on tools"
    ]),
    lessonSection("Dont’s", [
      "Use tools without proper training",
      "Use wrong tools for any lab activities",
      "Wear improper clothing",
      "Wear improper protective clothing",
      "Leave work unattended",
      "Ignore safety guidelines or protocols",
      "Leave any sharp objects behind",
      "Leave any hazardous chemical around",
      "Use worn tools"
    ]),
    lessonSection("Electrical Safety", [
      "Avoid leaving any liquids near the sockets",
      "Avoid overheating any power tools",
      "Avoid leaving any power tools that is still attached to the socket",
      "Keep any flammable materials away from the socket"
    ]),
    lessonSection("Chemical Safety", [
      "Keep any hazardous chemicals away from children",
      "Close the lids of the chemicals",
      "Use proper tools when handling hazardous chemicals",
      "Follow instructions to avoid any injuries"
    ]),
    lessonSection("Fire Safety", [
      "Keep any flammable material away from the socket",
      "Don't block any fire exits",
      "Keep fire extinguisher near the workplace for any unexpected events"
    ]),
    lessonSection("Personal safety", [
      "Use proper protective equipment",
      "Keep first aid kit near the working station for easy access"
    ]),
    lessonSection("Hazardous signs that you should be aware of:", [])
  ])
});

function figure({ semanticId, title, description, file, alt, pdfPage, provenanceNote }) {
  return Object.freeze({
    semanticId,
    title,
    description,
    image: `${ASSET_ROOT}/${file}`,
    alt,
    videoUrl: null,
    detailMode: "readable-figure",
    pdfPage,
    provenanceNote
  });
}

export const HARDWARE_EASY_MODULE3_CONTENT = Object.freeze([
  figure({
    semanticId: "ohs-laboratory-safety-rules",
    title: "Laboratory Safety Rules",
    description: "Instructional poster accompanying the Safety Lab Procedures section.",
    file: "image-03.png",
    alt: "Laboratory safety rules poster with illustrated safe conduct reminders for a technical workspace.",
    pdfPage: 1,
    provenanceNote: "Exact decoded-pixel match to the first instructional figure in the authoritative Module 3 PDF."
  }),
  figure({
    semanticId: "ohs-safety-clothing-hazards",
    title: "Safety Clothing and Hazard Icons",
    description: "Instructional figure accompanying the workplace do’s, dont’s, and safety guidance.",
    file: "image-01.png",
    alt: "Protective work clothing surrounded by workplace safety and hazard symbols.",
    pdfPage: 2,
    provenanceNote: "Exact decoded-pixel match to the second instructional figure in the authoritative Module 3 PDF."
  }),
  figure({
    semanticId: "ohs-complete-ppe",
    title: "Complete PPE",
    description: "Instructional diagram accompanying the Personal safety section.",
    file: "image-02.png",
    alt: "Worker wearing a complete set of personal protective equipment with labeled safety items.",
    pdfPage: 3,
    provenanceNote: "Exact decoded-pixel match to the third instructional figure in the authoritative Module 3 PDF."
  }),
  figure({
    semanticId: "ohs-hazardous-signs",
    title: "Hazardous Signs",
    description: "Reference chart accompanying the hazardous-signs heading in the lesson.",
    file: "image-04.png",
    alt: "Chart of common warning, prohibition, mandatory, emergency, and fire safety signs.",
    pdfPage: 3,
    provenanceNote: "Exact decoded-pixel match to the fourth instructional figure in the authoritative Module 3 PDF."
  })
]);
