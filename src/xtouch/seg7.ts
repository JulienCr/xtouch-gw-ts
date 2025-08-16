/**
 * Encode un caractère vers son masque 7-segments (bit0=a … bit6=g).
 * Les lettres sont mappées en majuscules lorsque pertinent.
 */
export function sevenSegForChar(ch: string): number {
  const c = (ch || " ").toUpperCase();
  switch (c) {
    case "0": return 0x3F; case "1": return 0x06; case "2": return 0x5B; case "3": return 0x4F;
    case "4": return 0x66; case "5": return 0x6D; case "6": return 0x7D; case "7": return 0x07;
    case "8": return 0x7F; case "9": return 0x6F; case "A": return 0x77; case "B": return 0x7C;
    case "C": return 0x39; case "D": return 0x5E; case "E": return 0x79; case "F": return 0x71;
    case "G": return 0x3D; case "H": return 0x76; case "I": return 0x06; case "J": return 0x1E;
    case "L": return 0x38; case "N": return 0x37; case "O": return 0x3F; case "P": return 0x73;
    case "S": return 0x6D; case "T": return 0x78; case "U": return 0x3E; case "Y": return 0x6E;
    case "-": return 0x40; case "_": return 0x08; case " ": default: return 0x00;
  }
}

export function centerToLength(s: string, targetLen: number): string {
  const str = s ?? "";
  if (str.length >= targetLen) return str.slice(0, targetLen);
  const totalPad = targetLen - str.length;
  const left = Math.floor(totalPad / 2);
  return " ".repeat(left) + str + " ".repeat(totalPad - left);
}


