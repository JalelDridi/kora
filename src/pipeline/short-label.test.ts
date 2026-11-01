import { describe, expect, it } from "vitest";
import { autoShort } from "./short-label.ts";

describe("autoShort", () => {
  it("keeps a name of at most two words of at most 6 Latin letters each as it is", () => {
    expect(autoShort("AS Gabès")).toBe("AS Gabès");
    expect(autoShort("Real Madrid")).toBe("Real Madrid");
    expect(autoShort("Al Ahly")).toBe("Al Ahly");
  });

  it("FC Hammamet: Hammamet is 8 letters, 77.6 px of a 63 px tile, so its initials", () => {
    expect(autoShort("FC Hammamet")).toBe("FCH");
    expect(autoShort("Stade Gabèsien")).toBe("SG");
  });

  it("gives the initials of a longer name, connecting words left out", () => {
    expect(autoShort("Club Sportif de Hammam-Lif")).toBe("CSHL");
    expect(autoShort("Espérance Sportive de Tunis")).toBe("EST");
    expect(autoShort("Haninge/Brandbergen")).toBe("HB");
    expect(autoShort("Union Sportive Monastirienne")).toBe("USM");
    expect(autoShort("Stade d'Ariana Football Club")).toBe("SAFC");
  });

  it("leaves numbers out and spells a dotted abbreviation", () => {
    expect(autoShort("NK Istra 1961")).toBe("NKI");
    expect(autoShort("Blois Football 41")).toBe("BF");
    expect(autoShort("R.F.C. de Liège")).toBe("RFCL");
    expect(autoShort("Gol Gohar F.C.")).toBe("GGFC");
  });

  it("keeps at most 4 capitals", () => {
    expect(autoShort("Football Club Union Sportive Ben Guerdane")).toBe("FCUS");
  });

  it("keeps a connecting word when fewer than two initials would remain", () => {
    expect(autoShort("Al Brommapojkarna")).toBe("AB");
  });

  it("cuts a single long word to 5 letters and a dot", () => {
    expect(autoShort("Brommapojkarna")).toBe("Bromm.");
    expect(autoShort("Hammamet")).toBe("Hamma.");
  });

  it("an Arabic name: its first telling word, cut to 8 letters if longer", () => {
    expect(autoShort("النجم الرياضي الساحلي")).toBe("النجم");
    expect(autoShort("النادي الرياضي الصفاقسي")).toBe("الصفاقسي");
    expect(autoShort("نادي كرة القدم بالحمامات")).toBe("الحمامات");
    expect(autoShort("نادي أم صلال الرياضي")).toBe("أم صلال");
    expect(autoShort("الترجي الرياضي التونسي")).toBe("الترجي");
    expect(autoShort("الملعب التونسي")).toBe("الملعب التونسي");
    const cut = autoShort("كريستيانوبوليس الرياضي الكبير");
    expect([...cut]).toHaveLength(8);
    expect(cut).toBe("كريستيان");
  });

  it("never cuts a lam from its alef", () => {
    // The 8th letter is a lam followed by an alef: the cut steps back one.
    expect(autoShort("ابتثجحخلامكبير الرياضي التونسي")).toBe("ابتثجحخ");
  });

  it("every result has at most two words, of at most 6 Latin or 8 Arabic letters", () => {
    for (const name of [
      "Club Sportif de Hammam-Lif",
      "Haninge/Brandbergen",
      "Brommapojkarna",
      "النجم الرياضي الساحلي",
      "Olympique de Marseille",
    ]) {
      const words = autoShort(name).split(/\s+/);
      expect(words.length).toBeLessThanOrEqual(2);
      for (const w of words)
        expect([...w].length).toBeLessThanOrEqual(
          /\p{Script=Arabic}/u.test(w) ? 8 : 6,
        );
    }
  });
});
