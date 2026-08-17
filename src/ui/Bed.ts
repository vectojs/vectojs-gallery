import { Entity, Group, type IRenderer } from '@vectojs/core';
import { DOCUMENT_SCROLL_PHYSICS, ScrollView, Text } from '@vectojs/ui';
import type { Creation } from '../registry';
import { APPS } from '../apps';
import { DotGridBackground } from './DotGridBackground';
import { CreationCard } from './CreationCard';
import { AppCard } from './AppCard';
import { ContributionBanner } from './ContributionBanner';
import { Masthead } from './Masthead';
import { SectionHeader } from './SectionHeader';
import { COLOR, FONT } from './tokens';

const CARD_MIN_WIDTH = 250;
const APP_MIN_WIDTH = 340;
const GAP = 16;
const PADDING = 32;
const SECTION_GAP = 40;
const BOTTOM_PAD = 56;

export interface CatalogMetrics {
  padding: number;
  gap: number;
  sectionGap: number;
  bottomPad: number;
}

/** Responsive editorial density, resolved from the Bed's logical width. */
export function getCatalogMetrics(width: number): CatalogMetrics {
  if (width < 560) return { padding: 20, gap: 14, sectionGap: 32, bottomPad: 40 };
  if (width < 900) return { padding: 28, gap: 16, sectionGap: 36, bottomPad: 48 };
  return {
    padding: PADDING,
    gap: GAP,
    sectionGap: SECTION_GAP,
    bottomPad: BOTTOM_PAD,
  };
}

export function layoutCardRows<T extends Entity>(
  cells: T[],
  columns: number,
  cardWidth: number,
  startY: number,
  setRowHeight: (cell: T, height: number) => void,
  padding = PADDING,
  gap = GAP,
): number {
  let bottom = startY;
  let rowY = startY;
  for (let rowStart = 0; rowStart < cells.length; rowStart += columns) {
    const row = cells.slice(rowStart, rowStart + columns);
    const rowHeight = Math.max(...row.map((cell) => cell.height));
    row.forEach((cell, column) => {
      setRowHeight(cell, rowHeight);
      cell.setPosition(padding + column * (cardWidth + gap), rowY);
    });
    bottom = rowY + rowHeight;
    rowY = bottom + gap;
  }
  return bottom + gap;
}

/**
 * The scrollable hub surface: hero masthead, the creations grid, a full-width
 * contribution banner, and the "Built on VectoJS" forge-app cards —
 * all inside one ScrollView over a fixed dot-grid backdrop. `setCreations`
 * rebuilds only in response to filtering; the apps section always shows.
 */
export class Bed extends Entity {
  private background: DotGridBackground;
  private scroll: ScrollView;
  private creations: Creation[] = [];
  private creationCards: CreationCard[] = [];
  private appCards: AppCard[] = [];
  private contributionBanner: ContributionBanner | null = null;
  private masthead: Masthead | null = null;
  private creationsHeader: SectionHeader | null = null;
  private appsHeader: SectionHeader | null = null;
  private spacer: Group | null = null;
  private documentBuilt = false;

  constructor(
    width: number,
    height: number,
    private readonly onOpen: (creation: Creation) => void,
    private readonly invalidate: () => void = () => {},
  ) {
    super('Bed');
    this.width = width;
    this.height = height;
    this.background = new DotGridBackground(width, height);
    this.add(this.background);
    this.scroll = new ScrollView({
      width,
      height,
      scrollPhysics: DOCUMENT_SCROLL_PHYSICS,
    });
    for (const event of ['wheel', 'pointerdown', 'pointermove', 'pointerup'] as const) {
      this.scroll.on(event, this.invalidate);
    }
    this.add(this.scroll);
  }

  resize(width: number, height: number, creations: Creation[]): void {
    const scrollY = -this.scroll.content.y;
    this.width = width;
    this.height = height;
    this.background.width = width;
    this.background.height = height;
    this.scroll.width = width;
    this.scroll.height = height;
    if (!this.documentBuilt || this.creations !== creations) this.setCreations(creations);
    else {
      this.layoutDocument();
      this.scroll.updateContentSize();
      this.scroll.scrollTo(scrollY);
    }
  }

  setCreations(creations: Creation[]): void {
    this.creations = creations;
    const content = this.scroll.content;
    while (content.children.length) this.scroll.remove(content.children[0]);

    this.creationCards = [];
    this.appCards = [];
    this.contributionBanner = null;
    this.masthead = null;
    this.creationsHeader = null;
    this.appsHeader = null;
    this.spacer = null;
    this.documentBuilt = true;
    this.layoutDocument();
  }

  private layoutDocument(): void {
    const metrics = getCatalogMetrics(this.width);
    const innerW = Math.max(0, this.width - metrics.padding * 2);
    let y = metrics.padding;

    if (!this.masthead) {
      this.masthead = new Masthead(innerW, this.creations.length, APPS.length);
      this.scroll.add(this.masthead);
    }
    this.masthead.resizeTo(innerW);
    this.masthead.setPosition(metrics.padding, y);
    y += this.masthead.height;

    if (!this.creationsHeader) {
      this.creationsHeader = new SectionHeader(
        innerW,
        'Creations',
        'Single-entity showcase pieces — click one to run it live, right here.',
      );
      this.scroll.add(this.creationsHeader);
    }
    this.creationsHeader.resizeTo(innerW);
    this.creationsHeader.setPosition(metrics.padding, y);
    y += this.creationsHeader.height + 8;

    y = this.layoutCreationGrid(this.creations, innerW, y, metrics);

    if (!this.contributionBanner) {
      this.contributionBanner = new ContributionBanner(this.invalidate);
      this.scroll.add(this.contributionBanner);
    }
    this.contributionBanner.resizeTo(innerW);
    this.contributionBanner.setPosition(metrics.padding, y);
    y += this.contributionBanner.height;

    y += metrics.sectionGap;
    if (!this.appsHeader) {
      this.appsHeader = new SectionHeader(
        innerW,
        'Built on VectoJS',
        'Full applications from the forge program — real products stress-testing the engine.',
      );
      this.scroll.add(this.appsHeader);
    }
    this.appsHeader.resizeTo(innerW);
    this.appsHeader.setPosition(metrics.padding, y);
    y += this.appsHeader.height + 8;

    y = this.layoutAppGrid(innerW, y, metrics);

    // Invisible spacer so updateContentSize sees the bottom padding.
    if (!this.spacer) {
      this.spacer = new Group();
      this.spacer.width = 1;
      this.spacer.height = 1;
      this.scroll.add(this.spacer);
    }
    this.spacer.setPosition(metrics.padding, y + metrics.bottomPad - metrics.gap);

    this.scroll.updateContentSize();
  }

  /** Lays out creation cards and returns the next free Y. */
  private layoutCreationGrid(
    creations: Creation[],
    innerW: number,
    startY: number,
    metrics: CatalogMetrics,
  ): number {
    if (creations.length === 0) {
      const empty = new Text('No matches — try a different search or fewer tags.', {
        font: FONT.body(14),
        color: COLOR.textMuted,
      });
      empty.setPosition(metrics.padding, startY + 8);
      this.scroll.add(empty);
      return startY + 8 + empty.height + metrics.gap;
    }

    const columns = Math.max(
      1,
      Math.floor((innerW + metrics.gap) / (CARD_MIN_WIDTH + metrics.gap)),
    );
    const cardW = (innerW - metrics.gap * (columns - 1)) / columns;

    const cards = creations.map((creation, i) => {
      const existing = this.creationCards[i];
      if (existing && existing.id === `CreationCard:${creation.id}`) {
        existing.resizeTo(cardW);
        return existing;
      }
      const card = new CreationCard(cardW, creation, i + 1, this.onOpen, this.invalidate);
      this.scroll.add(card);
      return card;
    });
    this.creationCards = cards;
    return layoutCardRows(
      cards,
      columns,
      cardW,
      startY,
      (cell, rowHeight) => {
        if (cell instanceof CreationCard) cell.setUniformHeight(rowHeight);
      },
      metrics.padding,
      metrics.gap,
    );
  }

  /** Lays out the forge-app cards; returns the next free Y. */
  private layoutAppGrid(innerW: number, startY: number, metrics: CatalogMetrics): number {
    const columns = Math.max(1, Math.floor((innerW + metrics.gap) / (APP_MIN_WIDTH + metrics.gap)));
    const cardW = (innerW - metrics.gap * (columns - 1)) / columns;

    const cards = APPS.map((app, i) => {
      const existing = this.appCards[i];
      if (existing && existing.id === `AppCard:${app.id}`) {
        existing.resizeTo(cardW);
        return existing;
      }
      const card = new AppCard(cardW, app, this.invalidate);
      this.scroll.add(card);
      return card;
    });
    this.appCards = cards;
    return layoutCardRows(
      cards,
      columns,
      cardW,
      startY,
      (card, rowHeight) => {
        card.setUniformHeight(rowHeight);
      },
      metrics.padding,
      metrics.gap,
    );
  }

  override isPointInside(_globalX: number, _globalY: number): boolean {
    return false;
  }

  override render(_r: IRenderer): void {}
}
