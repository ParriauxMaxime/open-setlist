/**
 * Convert Ultimate Guitar tab content to ChordPro format.
 *
 * UG uses a custom markup:
 *   [ch]Am[/ch]        → chord annotation
 *   [tab]...[/tab]     → tablature block
 *   [Verse 1], [Chorus], [Bridge], [Intro], [Outro], [Solo] etc. → section headers
 */
export function convertUGToChordPro(ugContent: string): string {
  let result = ugContent;

  // Convert chord annotations: [ch]Am[/ch] → [Am]
  result = result.replace(/\[ch\](.*?)\[\/ch\]/g, "[$1]");

  // Convert tab blocks: [tab]...[/tab] → {start_of_tab}...{end_of_tab}
  result = result.replace(/\[tab\]/g, "{start_of_tab}");
  result = result.replace(/\[\/tab\]/g, "{end_of_tab}");

  // Convert section headers to ChordPro directives.
  // Process line by line to wrap sections properly.
  const lines = result.split("\n");
  const output: string[] = [];
  let currentSection: string | null = null;

  for (const line of lines) {
    const sectionMatch = line.match(/^\[([A-Za-z][A-Za-z0-9 ]*)\]\s*$/);

    if (sectionMatch) {
      const label = sectionMatch[1].trim();

      // Close previous section if open
      if (currentSection) {
        output.push(endDirective(currentSection));
        output.push("");
      }

      output.push(startDirective(label));
      currentSection = label;
    } else {
      output.push(line);
    }
  }

  // Close final section
  if (currentSection) {
    output.push(endDirective(currentSection));
  }

  return output.join("\n").trim();
}

function normalizeSection(label: string): string {
  return label.toLowerCase().replace(/\s+\d+$/, "");
}

function startDirective(label: string): string {
  const section = normalizeSection(label);
  switch (section) {
    case "verse":
      return `{start_of_verse: ${label}}`;
    case "chorus":
      return "{start_of_chorus}";
    case "bridge":
      return "{start_of_bridge}";
    default:
      return `{comment: ${label}}`;
  }
}

function endDirective(label: string): string {
  const section = normalizeSection(label);
  switch (section) {
    case "verse":
      return "{end_of_verse}";
    case "chorus":
      return "{end_of_chorus}";
    case "bridge":
      return "{end_of_bridge}";
    default:
      return "";
  }
}
