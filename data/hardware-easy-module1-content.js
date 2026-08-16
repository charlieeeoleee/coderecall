const ASSET_ROOT = "assets/modules/hardware/easy/module1";

export const HARDWARE_EASY_MODULE1_CATEGORIES = Object.freeze([
  Object.freeze({
    categoryId: "main-computer-parts",
    categoryLabel: "Main Computer Parts",
    subtitle: ""
  }),
  Object.freeze({
    categoryId: "internal-parts",
    categoryLabel: "Internal Parts",
    subtitle: ""
  }),
  Object.freeze({
    categoryId: "ports",
    categoryLabel: "Ports",
    subtitle: ""
  }),
  Object.freeze({
    categoryId: "input-devices",
    categoryLabel: "Input Devices",
    subtitle: "An input device is a device that is connected in order for it to access data from the user."
  }),
  Object.freeze({
    categoryId: "output-devices",
    categoryLabel: "Output Devices",
    subtitle: "Output devices are the one that is used to provide information to the users."
  })
]);

function entry({ semanticId, categoryId, categoryLabel, title, description, file, alt, pdfPage, provenanceNote = "Direct visual match to the authoritative Module 1 PDF." }) {
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

export const HARDWARE_EASY_MODULE1_CONTENT = Object.freeze([
  entry({ semanticId: "main-monitor", categoryId: "main-computer-parts", categoryLabel: "Main Computer Parts", title: "Monitor", description: "It serves as the output device that can display videos, images, text. That is used to interact with the user.", file: "image-10.png", alt: "Desktop computer monitor displaying a landscape image.", pdfPage: 1 }),
  entry({ semanticId: "main-mouse", categoryId: "main-computer-parts", categoryLabel: "Main Computer Parts", title: "Mouse", description: "It is used as a pointing device that controls the cursor that is used to interact or send commands to the computer.", file: "image-09.png", alt: "Wired computer mouse with two buttons and a scroll wheel.", pdfPage: 1 }),
  entry({ semanticId: "main-keyboard", categoryId: "main-computer-parts", categoryLabel: "Main Computer Parts", title: "Keyboard", description: "It is one of input devices that is used to input commands or information to the computer; it consists of letters, numbers, and other special characters.", file: "image-19.png", alt: "Compact computer keyboard.", pdfPage: 1 }),
  entry({ semanticId: "main-avr", categoryId: "main-computer-parts", categoryLabel: "Main Computer Parts", title: "AVR", description: "Also known as Automatic Voltage Regulator that is used to protect the Computer from any unexpected changes on the electricity that might cause damage to the other components of the Computer or short circuit. This also helps to regulate the electricity to the computer components.", file: "image-31.png", alt: "Black automatic voltage regulator unit.", pdfPage: 1 }),
  entry({ semanticId: "main-system-unit", categoryId: "main-computer-parts", categoryLabel: "Main Computer Parts", title: "System unit", description: "The system unit serves as the main container of the computer's internal components (ex: PSU, Hard disk drive, motherboard).", file: "image-11.png", alt: "Desktop tower system unit.", pdfPage: 2 }),
  entry({ semanticId: "main-system-chassis", categoryId: "main-computer-parts", categoryLabel: "Main Computer Parts", title: "System chassis", description: "System chassis is the one that holds all of the Computer components in place.", file: "image-33.png", alt: "Open computer system chassis without internal components installed.", pdfPage: 2 }),

  entry({ semanticId: "internal-psu", categoryId: "internal-parts", categoryLabel: "Internal Parts", title: "PSU", description: "Also known as the Power Supply Unit that is used to provide electricity or power to the computer.", file: "image-23.png", alt: "Desktop computer power supply unit with a cooling fan.", pdfPage: 2 }),
  entry({ semanticId: "internal-hdd", categoryId: "internal-parts", categoryLabel: "Internal Parts", title: "HDD", description: "It is also known as Hard Disk Drive that is used as the main storage device of the computer. It holds some of the files in a computer, mostly those that are stored in the desktop files.", file: "image-42.png", alt: "Opened hard disk drive showing its platter and actuator arm.", pdfPage: 2 }),
  entry({ semanticId: "internal-odd", categoryId: "internal-parts", categoryLabel: "Internal Parts", title: "ODD", description: "Also known as Optical Disk Drive that helps to read and write data from the optical disk.", file: "image-32.png", alt: "Internal optical disc drive.", pdfPage: 3 }),
  entry({ semanticId: "internal-ram", categoryId: "internal-parts", categoryLabel: "Internal Parts", title: "RAM", description: "It is known to be as the temporary storage device that is used to hold data when the computer is on. It is also known as Random Access Memory.", file: "image-27.png", alt: "Two desktop RAM modules.", pdfPage: 3 }),
  entry({ semanticId: "internal-rom", categoryId: "internal-parts", categoryLabel: "Internal Parts", title: "ROM", description: "It is also known as Read Only Memory that is used to store data even if the computer is off.", file: "image-26.png", alt: "Opened hard disk drive showing its controller circuit board; labeled ROM in the source PDF.", pdfPage: 3, provenanceNote: "The authoritative PDF labels this opened HDD/controller-board image as ROM; the source identity is intentionally preserved." }),
  entry({ semanticId: "internal-bios-chip", categoryId: "internal-parts", categoryLabel: "Internal Parts", title: "BIOS Chip", description: "BIOS Chip is a chip on your motherboard that runs when you open your computer.", file: "image-35.png", alt: "Socketed BIOS firmware chip beside a CMOS coin-cell battery.", pdfPage: 3, provenanceNote: "The PDF uses a combined BIOS-chip and CMOS-battery photograph for the BIOS Chip entry." }),
  entry({ semanticId: "internal-cmos", categoryId: "internal-parts", categoryLabel: "Internal Parts", title: "CMOS", description: "CMOS is also known as Complementary Metal-Oxide-Semiconductor that serves as the small memory on your computer.", file: "image-46.png", alt: "CR2032 CMOS coin-cell battery installed on a motherboard.", pdfPage: 3, provenanceNote: "The PDF labels this dedicated coin-cell-battery image as CMOS." }),
  entry({ semanticId: "internal-cpu", categoryId: "internal-parts", categoryLabel: "Internal Parts", title: "CPU", description: "It is also known as Central Processing Unit that acts as the brain of the computer, it is also the main part of a computer.", file: "image-39.png", alt: "Computer CPU positioned over a motherboard socket.", pdfPage: 4 }),
  entry({ semanticId: "internal-cpu-socket", categoryId: "internal-parts", categoryLabel: "Internal Parts", title: "CPU Socket", description: "A CPU socket is placed on a motherboard that holds the CPU in order for it to work together with the computer.", file: "image-40.png", alt: "Open CPU socket on a motherboard.", pdfPage: 4 }),
  entry({ semanticId: "internal-cpu-fan-heatsink", categoryId: "internal-parts", categoryLabel: "Internal Parts", title: "CPU Fan / Heat Sink", description: "CPU heatsink is the one that prevents the CPU from overheating, its main purpose is to cool down the CPU.", file: "image-06.png", alt: "CPU cooling fan mounted on an aluminum heat sink.", pdfPage: 4 }),
  entry({ semanticId: "internal-system-fan", categoryId: "internal-parts", categoryLabel: "Internal Parts", title: "System Fan", description: "A system fan can be found at the back of the side panel of the system unit, it is the one that helps to cool the computer.", file: "image-08.png", alt: "Square computer system cooling fan.", pdfPage: 4 }),
  entry({ semanticId: "internal-motherboard", categoryId: "internal-parts", categoryLabel: "Internal Parts", title: "Motherboard", description: "It is the main circuit board of the computer that connects some of the internal computer parts like RAM, HDD, etc.", file: "image-45.png", alt: "Computer motherboard with CPU socket, memory slots, expansion slots, and rear ports.", pdfPage: 4 }),
  entry({ semanticId: "internal-ram-slot", categoryId: "internal-parts", categoryLabel: "Internal Parts", title: "RAM Slot", description: "It is where the RAM modules are being placed on.", file: "image-05.png", alt: "Rows of RAM slots on a computer motherboard.", pdfPage: 5 }),
  entry({ semanticId: "internal-expansion-slots", categoryId: "internal-parts", categoryLabel: "Internal Parts", title: "Expansion Slots", description: "This is where the expansion card is being placed, like graphics card and modem card.", file: "image-04.png", alt: "PCI network interface card; labeled Expansion Slots in the source PDF.", pdfPage: 5, provenanceNote: "The authoritative PDF uses this network-interface-card photograph for Expansion Slots; the source identity is intentionally preserved." }),
  entry({ semanticId: "internal-sound-card", categoryId: "internal-parts", categoryLabel: "Internal Parts", title: "Sound Card", description: "It is an expansion card that is responsible for the sound of the computer, that can be heard using the computer speaker, earphones or even headphones.", file: "image-01.png", alt: "Computer sound card with multiple audio connectors.", pdfPage: 5 }),
  entry({ semanticId: "internal-lan-card", categoryId: "internal-parts", categoryLabel: "Internal Parts", title: "LAN Card", description: "LAN Cards are also called the NIC or Network Interface Card that can be found inside the computer it is used as the internet connector of your computer.", file: "image-16.png", alt: "PCI network interface card with an Ethernet port.", pdfPage: 5 }),
  entry({ semanticId: "internal-graphics-card", categoryId: "internal-parts", categoryLabel: "Internal Parts", title: "Graphics Card", description: "Graphics card or also called as GPU or Graphics processing unit that handles everything that you can see on the screen of your computer.", file: "image-28.png", alt: "Graphics card with two cooling fans and display connectors.", pdfPage: 5 }),
  entry({ semanticId: "internal-expansion-bus", categoryId: "internal-parts", categoryLabel: "Internal Parts", title: "Expansion Bus", description: "It is the one that allows the computer to use any type of expansion board that is used to connect and communicate with the computer.", file: "image-30.png", alt: "Motherboard PCI expansion slots; labeled Expansion Bus in the source PDF.", pdfPage: 6, provenanceNote: "The authoritative PDF labels this motherboard-expansion-slot photograph as Expansion Bus." }),

  entry({ semanticId: "port-back-panel", categoryId: "ports", categoryLabel: "Ports", title: "Ports (Back Panel)", description: "Back panel ports are located at the back of the system unit that consist of the following peripherals connectors like keyboard, printer and mouse.", file: "image-37.png", alt: "Motherboard back-panel input and output connectors.", pdfPage: 6 }),
  entry({ semanticId: "port-ps2", categoryId: "ports", categoryLabel: "Ports", title: "PS/2 Ports", description: "This type of port is commonly used to connect the keyboard and mouse.", file: "image-12.png", alt: "Purple and green PS/2 keyboard and mouse ports.", pdfPage: 6 }),
  entry({ semanticId: "port-serial", categoryId: "ports", categoryLabel: "Ports", title: "Serial Port", description: "It can also be used to connect devices like a mouse or modem.", file: "image-14.png", alt: "Nine-pin serial port.", pdfPage: 6 }),
  entry({ semanticId: "port-parallel", categoryId: "ports", categoryLabel: "Ports", title: "Parallel Port", description: "It is the type of port that sends the computer multiple bits of data at the same time.", file: "image-13.png", alt: "Twenty-five-pin parallel port.", pdfPage: 6 }),
  entry({ semanticId: "port-audio", categoryId: "ports", categoryLabel: "Ports", title: "Audio Port", description: "It is where we can plug microphones, speakers or even headphones.", file: "image-47.png", alt: "Color-coded line-in, microphone, and headphone audio ports.", pdfPage: 7 }),
  entry({ semanticId: "port-vga", categoryId: "ports", categoryLabel: "Ports", title: "VGA Port", description: "It is also known as Video Graphics Array that is used to connect the computer to the monitor screen.", file: "image-41.png", alt: "Blue fifteen-pin VGA display port.", pdfPage: 7 }),
  entry({ semanticId: "port-hdmi", categoryId: "ports", categoryLabel: "Ports", title: "HDMI Port", description: "HDMI or also known as High-Definition Multimedia Interface that is used to send videos and audios to a computer screen.", file: "image-36.png", alt: "HDMI digital audio and video port.", pdfPage: 7 }),
  entry({ semanticId: "port-lan", categoryId: "ports", categoryLabel: "Ports", title: "LAN Port", description: "It is a socket where you can plug in your ethernet cable to the local network or internet.", file: "image-03.png", alt: "Ethernet LAN ports highlighted on a computer back panel.", pdfPage: 7 }),
  entry({ semanticId: "port-ide", categoryId: "ports", categoryLabel: "Ports", title: "IDE Port", description: "IDE is also known as Integrated Drive Electronics that is used to", file: "image-43.png", alt: "IDE and floppy-drive ribbon-cable connectors on a motherboard.", pdfPage: 7, provenanceNote: "The IDE Port sentence ends after 'used to' in the authoritative PDF and is intentionally not completed." }),
  entry({ semanticId: "port-sata", categoryId: "ports", categoryLabel: "Ports", title: "SATA Port", description: "SATA is also known as Serial Advanced Technology Attachment that is used to connect storage devices.", file: "image-17.png", alt: "Group of SATA storage connectors on a motherboard.", pdfPage: 8 }),

  entry({ semanticId: "input-webcam", categoryId: "input-devices", categoryLabel: "Input Devices", title: "Web Cam", description: "It is used to capture images and videos.", file: "image-24.png", alt: "Web camera with an adjustable monitor clip.", pdfPage: 8 }),
  entry({ semanticId: "input-mouse", categoryId: "input-devices", categoryLabel: "Input Devices", title: "Mouse", description: "It is used to click or select any information on the computer, it is also used to control the mouse cursor.", file: "image-29.png", alt: "Wired computer mouse with two buttons and a scroll wheel.", pdfPage: 8 }),
  entry({ semanticId: "input-microphone", categoryId: "input-devices", categoryLabel: "Input Devices", title: "Microphone", description: "It is used to capture or input audios or sounds.", file: "image-02.png", alt: "Desktop microphone mounted on a stand.", pdfPage: 8 }),
  entry({ semanticId: "input-keyboard", categoryId: "input-devices", categoryLabel: "Input Devices", title: "Keyboard", description: "A keyboard is an input device that is used to type or input commands or information to the computer that consist of letters, numbers and other special characters.", file: "image-25.png", alt: "Compact computer keyboard.", pdfPage: 9 }),
  entry({ semanticId: "input-barcode-scanner", categoryId: "input-devices", categoryLabel: "Input Devices", title: "Barcode Scanner", description: "It is used to scan the barcodes of the items.", file: "image-20.png", alt: "Handheld barcode scanner.", pdfPage: 9 }),
  entry({ semanticId: "input-joystick", categoryId: "input-devices", categoryLabel: "Input Devices", title: "Joystick", description: "A joystick is a playing console that is commonly used in gaming to control the characters in the game.", file: "image-44.png", alt: "Gaming joystick with trigger and programmable buttons.", pdfPage: 9 }),
  entry({ semanticId: "input-scanner", categoryId: "input-devices", categoryLabel: "Input Devices", title: "Scanner", description: "It is used to transfer any type of physical documents, images digitally.", file: "image-38.png", alt: "Open flatbed document scanner.", pdfPage: 9 }),

  entry({ semanticId: "output-monitor", categoryId: "output-devices", categoryLabel: "Output Devices", title: "Monitor", description: "It is used to display graphical content.", file: "image-34.png", alt: "Desktop monitor displaying a beach image.", pdfPage: 10 }),
  entry({ semanticId: "output-plotter", categoryId: "output-devices", categoryLabel: "Output Devices", title: "Plotter", description: "It is used to print out large images.", file: "image-21.png", alt: "Large-format plotter printing a technical drawing.", pdfPage: 10 }),
  entry({ semanticId: "output-printer", categoryId: "output-devices", categoryLabel: "Output Devices", title: "Printer", description: "It is used to turn any digital document into a physical one.", file: "image-07.png", alt: "Ink-tank printer producing a color document.", pdfPage: 10 }),
  entry({ semanticId: "output-speaker", categoryId: "output-devices", categoryLabel: "Output Devices", title: "Speaker", description: "The speaker is used to produce sounds from the computer or can be from phones or any other devices.", file: "image-15.png", alt: "Pair of black computer speakers.", pdfPage: 10 }),
  entry({ semanticId: "output-headphones", categoryId: "output-devices", categoryLabel: "Output Devices", title: "Headphones", description: "It is a device that you can use to listen to audios privately.", file: "image-22.png", alt: "Over-ear headphones with an attached boom microphone.", pdfPage: 11, provenanceNote: "The authoritative PDF labels this headset-with-microphone photograph as Headphones." }),
  entry({ semanticId: "output-projector", categoryId: "output-devices", categoryLabel: "Output Devices", title: "Projector", description: "Projector is used to project any graphical content from the computer.", file: "image-18.png", alt: "Digital multimedia projector with a remote control.", pdfPage: 11 })
]);
