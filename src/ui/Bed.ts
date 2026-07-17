import { Entity, Group, type IRenderer } from "@vectojs/core";
import { ScrollView, Text } from "@vectojs/ui";
import type { Creation } from "../registry";
import { APPS } from "../apps";
import { DotGridBackground } from "./DotGridBackground";
import { CreationCard } from "./CreationCard";
import { AppCard } from "./AppCard";
import { SubmitCard } from "./SubmitCard";
import { Masthead } from "./Masthead";
import { SectionHeader } from "./SectionHeader";
import { COLOR, FONT } from "./tokens";

const CARD_MIN_WIDTH = 250;
const APP_MIN_WIDTH = 340;
const GAP = 16;
const PADDING = 32;
const SECTION_GAP = 40;
const BOTTOM_PAD = 56;

/**
 * The scrollable hub surface: hero masthead, the creations grid (with the
 * submit CTA as its last cell), and the "Built on VectoJS" forge-app cards —
 * all inside one ScrollView over a fixed dot-grid backdrop. `setCreations`
 * rebuilds only in response to filtering; the apps section always shows.
 */
export class Bed extends Entity {
  private background: DotGridBackground;
  private scroll: ScrollView;
  private creations: Creation[] = [];

  constructor(
    width: number,
    height: number,
    private readonly onOpen: (creation: Creation) => void,
  ) {
    super("Bed");
    this.width = width;
    this.height = height;
    this.background = new DotGridBackground(width, height);
    this.add(this.background);
    this.scroll = new ScrollView({ width, height });
    this.add(this.scroll);
  }

  resize(width: number, height: number, creations: Creation[]): void {
    this.width = width;
    this.height = height;
    this.background.width = width;
    this.background.height = height;
    // Rebuild the ScrollView wholesale: its viewport box is a construction
    // input, and resizes are rare enough that resetting scroll position is a
    // fair trade for not depending on internal re-clamp behavior.
    this.remove(this.scroll);
    this.scroll = new ScrollView({ width, height });
    this.add(this.scroll);
    this.setCreations(creations);
  }

  setCreations(creations: Creation[]): void {
    this.creations = creations;
    const content = this.scroll.content;
    while (content.children.length) this.scroll.remove(content.children[0]);

    const innerW = this.width - PADDING * 2;
    let y = PADDING;

    const masthead = new Masthead(innerW, this.creations.length, APPS.length);
    masthead.setPosition(PADDING, y);
    this.scroll.add(masthead);
    y += masthead.height;

    const creationsHeader = new SectionHeader(
      innerW,
      "Creations",
      "Single-entity showcase pieces — click one to run it live, right here.",
    );
    creationsHeader.setPosition(PADDING, y);
    this.scroll.add(creationsHeader);
    y += creationsHeader.height + 8;

    y = this.layoutCreationGrid(creations, innerW, y);

    y += SECTION_GAP;
    const appsHeader = new SectionHeader(
      innerW,
      "Built on VectoJS",
      "Full applications from the forge program — real products stress-testing the engine.",
    );
    appsHeader.setPosition(PADDING, y);
    this.scroll.add(appsHeader);
    y += appsHeader.height + 8;

    y = this.layoutAppGrid(innerW, y);

    // Invisible spacer so updateContentSize sees the bottom padding.
    const spacer = new Group();
    spacer.setPosition(PADDING, y + BOTTOM_PAD - GAP);
    spacer.width = 1;
    spacer.height = 1;
    this.scroll.add(spacer);

    this.scroll.updateContentSize();
    this.scroll.scrollTo(0);
  }

  /** Lays out creation cards + the submit CTA; returns the next free Y. */
  private layoutCreationGrid(
    creations: Creation[],
    innerW: number,
    startY: number,
  ): number {
    if (creations.length === 0) {
      const empty = new Text(
        "No matches — try a different search or fewer tags.",
        { font: FONT.body(14), color: COLOR.textMuted },
      );
      empty.setPosition(PADDING, startY + 8);
      this.scroll.add(empty);
      return startY + 8 + empty.height + GAP;
    }

    const columns = Math.max(
      1,
      Math.floor((innerW + GAP) / (CARD_MIN_WIDTH + GAP)),
    );
    const cardW = (innerW - GAP * (columns - 1)) / columns;

    const cards = creations.map(
      (creation, i) => new CreationCard(cardW, creation, i + 1, this.onOpen),
    );
    const rowH = Math.max(...cards.map((c) => c.height));
    let bottom = startY;
    const cells: Entity[] = [...cards, new SubmitCard(cardW, rowH)];
    cells.forEach((cell, i) => {
      if (cell instanceof CreationCard) cell.setUniformHeight(rowH);
      const col = i % columns;
      const row = Math.floor(i / columns);
      cell.setPosition(
        PADDING + col * (cardW + GAP),
        startY + row * (rowH + GAP),
      );
      this.scroll.add(cell);
      bottom = Math.max(bottom, startY + row * (rowH + GAP) + rowH);
    });
    return bottom + GAP;
  }

  /** Lays out the forge-app cards; returns the next free Y. */
  private layoutAppGrid(innerW: number, startY: number): number {
    const columns = Math.max(
      1,
      Math.floor((innerW + GAP) / (APP_MIN_WIDTH + GAP)),
    );
    const cardW = (innerW - GAP * (columns - 1)) / columns;

    const cards = APPS.map(
      (app) => new AppCard(cardW, app, () => this.scene?.markDirty()),
    );
    const rowH = Math.max(...cards.map((c) => c.height));
    let bottom = startY;
    cards.forEach((card, i) => {
      card.setUniformHeight(rowH);
      const col = i % columns;
      const row = Math.floor(i / columns);
      card.setPosition(
        PADDING + col * (cardW + GAP),
        startY + row * (rowH + GAP),
      );
      this.scroll.add(card);
      bottom = Math.max(bottom, startY + row * (rowH + GAP) + rowH);
    });
    return bottom + GAP;
  }

  override isPointInside(_globalX: number, _globalY: number): boolean {
    return false;
  }

  override render(_r: IRenderer): void {}
}
