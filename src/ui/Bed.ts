import { Entity, type IRenderer } from "@vectojs/core";
import { Text } from "@vectojs/ui";
import type { Creation } from "../registry";
import { DotGridBackground } from "./DotGridBackground";
import { CreationCard } from "./CreationCard";
import { COLOR, FONT } from "./tokens";

const CARD_MIN_WIDTH = 220;
const GAP = 16;
const PADDING = 24;
// Top band the card grid leaves clear for the DotGridBackground masthead.
const MASTHEAD_BAND = 132;

export class Bed extends Entity {
  private background: DotGridBackground;
  private cards: CreationCard[] = [];
  private emptyMessage: Text | null = null;

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
  }

  resize(width: number, height: number, creations: Creation[]): void {
    this.width = width;
    this.height = height;
    this.background.width = width;
    this.background.height = height;
    this.setCreations(creations);
  }

  setCreations(creations: Creation[]): void {
    for (const card of this.cards) this.remove(card);
    this.cards = [];
    if (this.emptyMessage) {
      this.remove(this.emptyMessage);
      this.emptyMessage = null;
    }

    if (creations.length === 0) {
      this.emptyMessage = new Text(
        "No matches — try a different search or fewer tags.",
        {
          font: FONT.body(14),
          color: COLOR.textMuted,
        },
      );
      this.emptyMessage.setPosition(PADDING, PADDING + MASTHEAD_BAND);
      this.add(this.emptyMessage);
      return;
    }

    const available = this.width - PADDING * 2;
    const columns = Math.max(
      1,
      Math.floor((available + GAP) / (CARD_MIN_WIDTH + GAP)),
    );
    const cardWidth = (available - GAP * (columns - 1)) / columns;

    creations.forEach((creation, i) => {
      const card = new CreationCard(cardWidth, creation, i + 1, this.onOpen);
      const col = i % columns;
      const row = Math.floor(i / columns);
      card.setPosition(
        PADDING + col * (cardWidth + GAP),
        PADDING + MASTHEAD_BAND + row * (card.height + GAP),
      );
      this.add(card);
      this.cards.push(card);
    });
  }

  override isPointInside(_globalX: number, _globalY: number): boolean {
    return false;
  }

  override render(_r: IRenderer): void {}
}
