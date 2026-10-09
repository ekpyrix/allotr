import { money } from '@allotr/shared';
import { useState } from 'react';
import type { Selection } from 'react-aria-components';
import { Amount } from '@/components/amount';
import {
  Bar,
  LeftBar,
  ShareBar,
  Skeleton,
  SkeletonTile,
} from '@/components/bars';
import {
  BracketButton,
  Chip,
  PrimaryButton,
  Tag,
  ToggleGroup,
} from '@/components/buttons';
import { ChartsGallery } from './dev-charts';
import { Frame, Grid, Split, Stack, Tile } from '@/components/layout';
import {
  MenuCheckItem,
  MenuItem,
  MenuButton,
  MenuRadioItem,
  MenuSection,
  MenuSeparator,
} from '@/components/menu';
import { OverlayScrollbar } from '@/components/overlay-scrollbar';
import { Row, TreeRow } from '@/components/row';
import type { RowColumn } from '@/components/row-columns';
import { Sheet } from '@/components/sheet';
import { Stats, KeyFigures, SummaryLine } from '@/components/stats';
import { CategoryIcon, EmptyState, ResultLine } from '@/components/states';
import {
  IconAddLine,
  IconBankLine,
  IconFilter3Line,
  IconPieChart2Line,
} from '@/generated/icons';
import { formatMoney } from '@/lib/format-money';

// A development-only gallery of every primitive, with synthetic data. It is
// the Playwright target at 390, 820 and 1440 px (e2e/components.spec.ts).

const columns: readonly RowColumn[] = [
  { width: '3rem', from: 'wide' },
  { width: '1.25rem' },
  { width: 'minmax(0, 2fr)' },
  { width: 'minmax(0, 1.2fr)', from: 'medium' },
  { width: 'minmax(0, 1fr)', from: 'wide' },
  { width: 'auto' },
];

const entries = [
  { time: '08:12', icon: 'coffee', payee: 'Corner cafe', cat: 'Food › Coffee' },
  { time: '12:40', icon: 'utensils', payee: 'Noodle bar', cat: 'Food › Lunch' },
  {
    time: '18:05',
    icon: 'shopping-basket',
    payee: 'Market',
    cat: 'Food › Groceries',
  },
] as const;

const periods = ['This cycle', 'Last cycle', 'This month', 'Last month'];

export function DevComponentsPage() {
  const [scheme, setScheme] = useState<'light' | 'dark'>('light');
  const [view, setView] = useState<'list' | 'tree'>('list');
  const [period, setPeriod] = useState(periods[0] ?? '');
  const [selected, setSelected] = useState(1);
  const [sheet, setSheet] = useState(false);
  const [chips, setChips] = useState(['Food', 'Daily card']);
  const [folded, setFolded] = useState(false);
  const [filterKeys, setFilterKeys] = useState<Selection>(new Set(['food']));
  const [sortKeys, setSortKeys] = useState<Selection>(new Set(['newest']));

  return (
    <Frame className="min-h-dvh">
      <main>
        <div className="flex h-strip items-center gap-3 border-b bg-chrome px-3">
          <h1 className="text-base font-semibold">Components</h1>
          <ToggleGroup
            label="Theme"
            value={scheme}
            onChange={(next) => {
              setScheme(next);
              document.documentElement.dataset.theme = next;
            }}
            options={[
              { id: 'light', label: 'Light' },
              { id: 'dark', label: 'Dark' },
            ]}
          />
          <PrimaryButton icon={IconAddLine} className="ml-auto">
            new
          </PrimaryButton>
        </div>

        <Stats
          stats={[
            {
              label: 'Left today',
              icon: IconPieChart2Line,
              figure: <Amount amount={money(3680, 'USD')} />,
              sub: 'of $55.20 · 15 days to payday',
              bar: { fraction: 0.67, label: 'Left of today’s allowance' },
              tone: 'positive',
            },
            {
              label: 'On budget',
              icon: IconBankLine,
              figure: <Amount amount={money(124000, 'USD')} />,
              sub: 'bills set aside $412.00',
            },
            {
              label: 'Credit owed',
              figure: <Amount amount={money(18000, 'USD')} />,
              sub: 'of $500.00 limit',
              bar: { fraction: 0.36, label: 'Credit limit used' },
            },
            {
              label: 'Reconcile',
              figure: '2',
              sub: 'accounts need a look',
            },
          ]}
        />

        <Grid>
          <Tile
            title="Transactions"
            subtitle="14 entries"
            icon={IconBankLine}
            primary
            span={2}
            actions={
              <>
                <MenuButton label="Period" value={period} title="Period">
                  <MenuSection title="Period">
                    {periods.map((name) => (
                      <MenuItem
                        key={name}
                        id={name}
                        label={name}
                        onAction={() => {
                          setPeriod(name);
                        }}
                      />
                    ))}
                  </MenuSection>
                  <MenuSeparator />
                  <MenuItem id="custom" label="Custom…" hint="c" />
                </MenuButton>
                <MenuButton
                  label="Filter"
                  icon={IconFilter3Line}
                  title="Filter"
                  selectionMode="multiple"
                  selectedKeys={filterKeys}
                  onSelectionChange={setFilterKeys}
                >
                  <MenuSection title="Category">
                    <MenuCheckItem id="food" label="Food" />
                    <MenuCheckItem id="home" label="Home" />
                  </MenuSection>
                </MenuButton>
                <MenuButton
                  label="Sort"
                  title="Sort"
                  selectionMode="single"
                  selectedKeys={sortKeys}
                  onSelectionChange={setSortKeys}
                >
                  <MenuRadioItem id="newest" label="Newest first" />
                  <MenuRadioItem id="amount" label="Largest first" />
                </MenuButton>
              </>
            }
            bodyClassName="px-0 pb-0"
          >
            <div className="flex flex-wrap gap-1 border-b px-3 py-2">
              {chips.map((chip) => (
                <Chip
                  key={chip}
                  label={chip}
                  removeLabel={`Remove ${chip}`}
                  onRemove={() => {
                    setChips((current) => current.filter((c) => c !== chip));
                  }}
                />
              ))}
            </div>
            <div className="border-b px-3 py-1.5">
              <SummaryLine
                parts={[
                  '14 entries',
                  `spent ${formatMoney(money(120160, 'USD'))}`,
                  `net +${formatMoney(money(93840, 'USD'))}`,
                ]}
              />
            </div>
            {entries.map((entry, index) => (
              <Row
                key={entry.payee}
                tall
                columns={columns}
                selected={selected === index}
                onPress={() => {
                  setSelected(index);
                }}
                cells={[
                  <span key="t" className="text-text-muted">
                    {entry.time}
                  </span>,
                  <CategoryIcon key="i" name={entry.icon} color={1} />,
                  <span key="p" className="font-ui">
                    {entry.payee}
                  </span>,
                  <span key="c" className="font-ui text-text-muted">
                    {entry.cat}
                  </span>,
                  <span key="a" className="font-ui text-text-muted">
                    Daily card
                  </span>,
                  <Amount
                    key="m"
                    kind="expense"
                    amount={money(-(index + 1) * 1400, 'USD')}
                  />,
                ]}
              />
            ))}
          </Tile>

          <Tile title="Budgets" subtitle="cycle" icon={IconPieChart2Line}>
            <TreeRow
              role="parent"
              label="Food"
              expanded={!folded}
              onToggle={() => {
                setFolded((value) => !value);
              }}
              columns={[{ width: 'minmax(0, 1fr)' }, { width: 'auto' }]}
              cells={['Food', <Amount key="a" amount={money(32000, 'USD')} />]}
            />
            {folded ? null : (
              <>
                <TreeRow
                  role="child"
                  label="Coffee"
                  columns={[{ width: 'minmax(0, 1fr)' }, { width: 'auto' }]}
                  cells={[
                    'Coffee',
                    <Amount key="a" amount={money(8000, 'USD')} />,
                  ]}
                />
                <TreeRow
                  role="last-child"
                  label="Groceries"
                  columns={[{ width: 'minmax(0, 1fr)' }, { width: 'auto' }]}
                  cells={[
                    'Groceries',
                    <Amount key="a" amount={money(24000, 'USD')} />,
                  ]}
                />
              </>
            )}
            <div className="grid gap-2 pt-3">
              <Bar value={0.62} pace={0.5} label="Food spent" />
              <Bar value={1} over label="Transport spent, over budget" />
              <LeftBar
                fraction={0.4}
                height={4}
                label="Left of the cycle start"
              />
              <ShareBar
                label="Pool shares"
                segments={[
                  { id: 'a', label: 'Daily', fraction: 0.5, color: 'series-1' },
                  { id: 'b', label: 'Bills', fraction: 0.3, color: 'series-2' },
                  { id: 'c', label: 'Rest', fraction: 0.2, color: 'series-3' },
                ]}
              />
            </div>
          </Tile>

          <Tile title="Controls" icon={IconAddLine}>
            <div className="flex flex-wrap items-center gap-2 py-2">
              <BracketButton>pay</BracketButton>
              <BracketButton icon={IconAddLine}>add</BracketButton>
              <BracketButton tone="destructive">delete</BracketButton>
              <ToggleGroup
                label="View"
                value={view}
                onChange={setView}
                options={[
                  { id: 'list', label: 'List' },
                  { id: 'tree', label: 'Tree' },
                ]}
              />
              <Tag>3d</Tag>
              <Tag tone="negative">9d late</Tag>
              <Tag tone="positive">✓ paid</Tag>
              <Tag tone="warning">review</Tag>
            </div>
            <KeyFigures
              figures={[
                { label: 'spent', figure: '$1,201.60' },
                { label: 'even pace', figure: '$1,104.00' },
                { label: 'under pace', figure: '$97.60' },
              ]}
            />
            <div className="flex gap-2 pt-3">
              <Amount kind="expense" amount={money(-1400, 'USD')} />
              <Amount kind="income" amount={money(214000, 'USD')} />
              <Amount kind="transfer" amount={money(15000, 'EUR')} />
              <Amount amount={money(1250, 'JPY')} />
            </div>
            <div className="pt-3">
              <BracketButton
                onPress={() => {
                  setSheet(true);
                }}
              >
                Open sheet
              </BracketButton>
            </div>
          </Tile>

          <Tile title="Empty" icon={IconBankLine}>
            <EmptyState
              icon={IconBankLine}
              title="No goals yet"
              hint="Goals you add appear here with their progress."
              action={<BracketButton icon={IconAddLine}>goal</BracketButton>}
            />
          </Tile>

          <Tile title="Scrolling" icon={IconBankLine}>
            <OverlayScrollbar label="Notes" className="h-24">
              {Array.from({ length: 12 }, (_, i) => (
                <p key={i} className="font-ui py-1">
                  Note {String(i + 1)}
                </p>
              ))}
            </OverlayScrollbar>
          </Tile>

          <SkeletonTile rows={3} />
        </Grid>

        <Stack>
          <Split
            list={
              <Tile title="List" icon={IconBankLine}>
                <Skeleton height="0.75rem" />
              </Tile>
            }
            detail={
              <Tile title="Detail" icon={IconBankLine}>
                <p className="font-ui">Shown beside the list from 1000 px.</p>
              </Tile>
            }
          />
        </Stack>

        <ChartsGallery />

        <ResultLine
          icon={<CategoryIcon name="coffee" color={1} />}
          amount={<Amount kind="expense" amount={money(-450, 'USD')} />}
          account="Daily card"
          left={<span>$32.30 left today</span>}
          undoLabel="undo"
          onUndo={() => undefined}
          onDismiss={() => undefined}
          dismissAfterMs={0}
        />
      </main>

      <Sheet isOpen={sheet} onOpenChange={setSheet} title="Lunch">
        <p className="font-ui p-3">A detail sheet.</p>
        <Row
          tall
          columns={columns}
          cells={[
            '08:12',
            <CategoryIcon key="i" name="coffee" color={1} />,
            <span key="p" className="font-ui">
              Corner cafe
            </span>,
            <span key="c" className="font-ui text-text-muted">
              Food › Coffee
            </span>,
            <span key="a" className="font-ui text-text-muted">
              Daily card
            </span>,
            <Amount key="m" kind="expense" amount={money(-1400, 'USD')} />,
          ]}
        />
      </Sheet>
    </Frame>
  );
}
