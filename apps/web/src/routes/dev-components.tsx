import {
  findPaletteTheme,
  formatMoney,
  money,
  type PaletteTheme,
} from '@allotr/shared';
import {
  CircleAlert,
  CircleCheck,
  Info,
  Plus,
  ReceiptText,
  Search,
  Settings,
  ShoppingBasket,
  TriangleAlert,
  Wallet,
} from 'lucide-react';
import { useId, useState, type CSSProperties } from 'react';
import { Field } from '@/components/field';
import { AmountField } from '@/components/ui/amount-field';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { AssistChip, FilterChip, InputChip } from '@/components/ui/chip';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Fab } from '@/components/ui/fab';
import { IconButton } from '@/components/ui/icon-button';
import { Label } from '@/components/ui/label';
import { List, ListRow, ListRowButton } from '@/components/ui/list';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
  Menu,
  MenuContent,
  MenuItem,
  MenuTrigger,
} from '@/components/ui/menu';
import { LinearProgress, RingProgress } from '@/components/ui/progress';
import { Segmented } from '@/components/ui/segmented';
import { Skeleton } from '@/components/ui/skeleton';
import { useSnackbar } from '@/components/ui/snackbar';
import { StatusChip } from '@/components/ui/status-chip';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsPanel } from '@/components/ui/tabs';
import { Tooltip } from '@/components/ui/tooltip';
import { roleProperties } from '@/lib/theme-mode';

// A development-only gallery of every primitive (registered only when
// import.meta.env.DEV), in both schemes and several palette families, each
// panel painted by scoping that theme's roles. The sample text and amounts
// here are made up and never ship.

const THEMES = [
  'catppuccin-latte',
  'catppuccin-mocha',
  'solarized-light',
  'gruvbox-dark',
];

const usd = (amountMinor: number) =>
  formatMoney(money(amountMinor, 'USD'), 'en-US');

function Panel({ theme }: { theme: PaletteTheme }) {
  const headingId = useId();
  const show = useSnackbar();
  const [filter, setFilter] = useState(true);
  const [range, setRange] = useState<'week' | 'cycle' | 'year'>('cycle');
  const [on, setOn] = useState(true);
  const [tab, setTab] = useState<'overview' | 'days'>('overview');
  const style = Object.fromEntries(
    roleProperties(theme.resolved.roles),
  ) as CSSProperties;
  return (
    <section
      aria-labelledby={headingId}
      data-theme={theme.scheme}
      style={{ ...style, colorScheme: theme.scheme }}
      className="grid gap-6 rounded-2xl bg-canvas p-4 text-text medium:p-6"
    >
      <h2 id={headingId} className="text-headline">
        {theme.name}
      </h2>

      <div className="flex flex-wrap items-center gap-3">
        <Button>Save</Button>
        <Button variant="tonal">Edit</Button>
        <Button variant="outlined">Cancel</Button>
        <Button variant="text">Skip</Button>
        <Button variant="danger-tonal">Delete</Button>
        <Button size="dense">
          <Plus aria-hidden="true" />
          Add
        </Button>
        <Button disabled>Disabled</Button>
        <Button variant="link">Learn more</Button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Tooltip content="Search entries">
          <IconButton aria-label="Search">
            <Search />
          </IconButton>
        </Tooltip>
        <IconButton aria-label="Settings" variant="tonal">
          <Settings />
        </IconButton>
        <IconButton aria-label="Add entry" variant="filled">
          <Plus />
        </IconButton>
        <Fab icon={<Plus aria-hidden="true" />} aria-label="Add entry" />
        <Fab icon={<Plus aria-hidden="true" />} label="Add" />
      </div>

      <div className="grid gap-3 medium:grid-cols-3">
        <Card>
          <p className="text-title-lg">Card</p>
          <p className="text-body text-text-muted">Default tier.</p>
        </Card>
        <Card variant="interactive" asChild>
          <button type="button" className="text-left">
            <span className="block text-title-lg">Interactive</span>
            <span className="block text-body text-text-muted">
              Steps up a tier when pressed.
            </span>
          </button>
        </Card>
        <Card variant="hero">
          <p className="text-label text-text-muted">Left today</p>
          <p className="font-mono text-display text-hero-ok">{usd(3840)}</p>
        </Card>
      </div>

      <List>
        <ListRow
          leading={<ShoppingBasket />}
          title="Groceries"
          supporting="Everyday · today"
          trailing={usd(-2450)}
        />
        <ListRowButton
          leading={<Wallet />}
          title="Everyday"
          supporting="On budget"
          trailing={usd(182000)}
          onClick={() => {
            show({ message: 'Opened Everyday' });
          }}
        />
        <ListRowButton
          leading={<ReceiptText />}
          title="Rent"
          trailing={usd(80000)}
        />
      </List>

      <div className="flex flex-wrap items-center gap-3">
        <FilterChip selected={filter} onSelectedChange={setFilter}>
          Food
        </FilterChip>
        <FilterChip
          selected={!filter}
          onSelectedChange={(v) => {
            setFilter(!v);
          }}
        >
          Transport
        </FilterChip>
        <InputChip label="Card" onRemove={() => undefined} />
        <AssistChip icon={<Plus aria-hidden="true" />}>New category</AssistChip>
      </div>

      <Segmented
        label="Range"
        value={range}
        onValueChange={setRange}
        options={[
          { value: 'week', label: 'Week' },
          { value: 'cycle', label: 'Cycle' },
          { value: 'year', label: 'Year' },
        ]}
      />

      <div className="flex items-center gap-3">
        <Switch
          id={`${headingId}-switch`}
          checked={on}
          onCheckedChange={setOn}
        />
        <Label htmlFor={`${headingId}-switch`}>Haptics</Label>
      </div>

      <div className="grid gap-4 medium:grid-cols-2">
        <Field label="Note" hint="Shown in the ledger." placeholder="Lunch" />
        <div className="grid gap-2">
          <Label htmlFor={`${headingId}-amount`}>Amount</Label>
          <AmountField
            id={`${headingId}-amount`}
            currency="USD"
            defaultValue="12.50"
          />
        </div>
      </div>

      <Tabs
        label="Cycle"
        value={tab}
        onValueChange={setTab}
        tabs={[
          { value: 'overview', label: 'Overview' },
          { value: 'days', label: 'Days' },
        ]}
      >
        <TabsPanel value="overview">Overview panel.</TabsPanel>
        <TabsPanel value="days">Days panel.</TabsPanel>
      </Tabs>

      <div className="flex flex-wrap items-center gap-3">
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="outlined">Open dialog</Button>
          </DialogTrigger>
          <DialogContent
            title="Reverse this entry?"
            description="The entry stays in the ledger, with a reversal beside it."
          >
            <div className="flex justify-end gap-3">
              <Button variant="text">Cancel</Button>
              <Button variant="danger-tonal">Reverse</Button>
            </div>
          </DialogContent>
        </Dialog>
        <Menu>
          <MenuTrigger asChild>
            <Button variant="outlined">Open menu</Button>
          </MenuTrigger>
          <MenuContent>
            <MenuItem>Edit</MenuItem>
            <MenuItem>Duplicate</MenuItem>
            <MenuItem variant="danger">Reverse</MenuItem>
          </MenuContent>
        </Menu>
        <ContextMenu>
          <ContextMenuTrigger className="rounded-md border border-dashed border-outline px-4 py-3 text-body">
            Right-click here
          </ContextMenuTrigger>
          <ContextMenuContent>
            <ContextMenuItem>Edit</ContextMenuItem>
            <ContextMenuItem variant="danger">Reverse</ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
        <Button
          variant="outlined"
          onClick={() => {
            show({
              message: `Saved. ${usd(3840)} left today`,
              action: { label: 'Undo', onAction: () => undefined },
            });
          }}
        >
          Show snackbar
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <StatusChip tone="success" icon={<CircleCheck />}>
          On pace
        </StatusChip>
        <StatusChip tone="warning" icon={<TriangleAlert />}>
          Tight
        </StatusChip>
        <StatusChip tone="danger" icon={<CircleAlert />}>
          Over
        </StatusChip>
        <StatusChip tone="info" icon={<Info />}>
          Reserved
        </StatusChip>
      </div>

      <div className="grid gap-3">
        <LinearProgress value={62} label="Cycle spent" />
        <RingProgress value={40} label="Savings goal" />
        <div className="grid gap-2" aria-busy="true">
          <Skeleton className="h-6 w-2/3" />
          <Skeleton className="h-6 w-1/2" />
        </div>
      </div>

      <Card>
        <EmptyState
          icon={<ReceiptText />}
          title="No entries yet. Add the first one."
          action={<Button size="dense">Add entry</Button>}
        />
      </Card>
    </section>
  );
}

export function DevComponentsPage() {
  const themes = THEMES.flatMap((id) => {
    const theme = findPaletteTheme(id, []);
    return theme === undefined ? [] : [theme];
  });
  return (
    <main className="mx-auto grid max-w-5xl gap-6 p-4">
      <h1 className="text-headline">Components</h1>
      {themes.map((theme) => (
        <Panel key={theme.id} theme={theme} />
      ))}
    </main>
  );
}
