import { Entity, type IRenderer } from "@vectojs/core";
import { Button, Input, Stack } from "@vectojs/ui";
import type { Creation } from "../registry";
import { filterCreations } from "../filter";
import { COLOR, FONT } from "./tokens";

const CHIP_ACTIVE_BG = COLOR.ink;
const CHIP_INACTIVE_BG = "transparent";

export class Rail extends Entity {
  private search = "";
  private activeTags = new Set<string>();
  private readonly listStack: Stack;
  private readonly chipRow: Stack;
  private chipButtons = new Map<string, Button>();

  constructor(
    width: number,
    height: number,
    private readonly allCreations: Creation[],
    private readonly onOpen: (creation: Creation) => void,
    private readonly onFilterChange: (filtered: Creation[]) => void,
  ) {
    super("Rail");
    this.width = width;
    this.height = height;

    const root = new Stack({ direction: "vertical", gap: 16 });
    root.padding = 20;
    this.add(root);

    const searchInput = new Input({
      width: width - 40,
      placeholder: "Filter creations…",
      onChange: (value) => {
        this.search = value;
        this.applyFilter();
      },
    });
    root.add(searchInput);

    this.chipRow = new Stack({
      direction: "horizontal",
      gap: 8,
      wrap: true,
      maxWidth: width - 40,
    });
    root.add(this.chipRow);

    const allTags = Array.from(
      new Set(allCreations.flatMap((c) => c.tags)),
    ).sort();
    for (const tag of allTags) {
      const btn = new Button(tag, {
        font: FONT.mono(11),
        bg: CHIP_INACTIVE_BG,
        color: COLOR.textMuted,
        padding: 6,
        onClick: () => this.toggleTag(tag),
      });
      this.chipButtons.set(tag, btn);
      this.chipRow.add(btn);
    }

    this.listStack = new Stack({ direction: "vertical", gap: 4 });
    root.add(this.listStack);

    this.rebuildList(allCreations);
  }

  private toggleTag(tag: string): void {
    if (this.activeTags.has(tag)) this.activeTags.delete(tag);
    else this.activeTags.add(tag);

    const btn = this.chipButtons.get(tag);
    if (btn)
      btn.bg = this.activeTags.has(tag) ? CHIP_ACTIVE_BG : CHIP_INACTIVE_BG;

    this.applyFilter();
  }

  private applyFilter(): void {
    const filtered = filterCreations(this.allCreations, {
      search: this.search,
      activeTags: Array.from(this.activeTags),
    });
    this.rebuildList(filtered);
    this.onFilterChange(filtered);
  }

  private rebuildList(creations: Creation[]): void {
    while (this.listStack.children.length) {
      this.listStack.remove(this.listStack.children[0]);
    }

    for (const creation of creations) {
      const row = new Button(creation.title, {
        font: FONT.body(13),
        bg: "transparent",
        color: COLOR.textPrimary,
        padding: 8,
        onClick: () => this.onOpen(creation),
      });
      this.listStack.add(row);
    }
  }

  override isPointInside(_globalX: number, _globalY: number): boolean {
    return false;
  }

  override render(r: IRenderer): void {
    r.beginPath();
    r.roundRect(0, 0, this.width, this.height, 0);
    r.fill(COLOR.groundRaised);
    r.stroke(COLOR.rule, 1);
  }
}
