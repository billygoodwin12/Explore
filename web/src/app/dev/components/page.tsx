"use client";

import { Activity, Inbox, MoreHorizontal, TrendingUp } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Avatar } from "@/components/primitives/Avatar";
import { EmptyState } from "@/components/primitives/EmptyState";
import { NumCell } from "@/components/primitives/NumCell";
import { Pill } from "@/components/primitives/Pill";
import { Skeleton } from "@/components/primitives/Skeleton";
import { SkinInGamePill } from "@/components/primitives/SkinInGamePill";
import { Sparkline } from "@/components/primitives/Sparkline";
import { Wordmark } from "@/components/primitives/Wordmark";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const SPARK_UP = [10, 11, 9, 12, 13, 11, 14, 15, 14, 16, 17, 18];
const SPARK_DOWN = [18, 17, 17, 15, 14, 13, 12, 11, 9, 10, 8, 7];

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-label">{title}</h2>
      <div className="rounded-lg border border-line bg-surface p-4">
        {children}
      </div>
    </section>
  );
}

export default function DevComponentsPage() {
  const [sliderVal, setSliderVal] = useState([42]);
  const [switchOn, setSwitchOn] = useState(false);

  return (
    <main className="min-h-screen bg-bg text-ink">
      <nav className="border-b border-line px-6 py-4 flex items-center justify-between">
        <Wordmark as="a" size="nav" />
        <span className="text-label">/dev/components</span>
      </nav>

      <div className="max-w-5xl mx-auto px-6 py-12 space-y-10">
        <header className="space-y-2">
          <h1 className="text-display-md">Component test bed</h1>
          <p className="text-ink-2">
            Internal-only. Exercises shadcn components + Theorise primitives.
          </p>
        </header>

        <Section title="Buttons — variants">
          <div className="flex flex-wrap gap-3">
            <Button variant="primary">Primary</Button>
            <Button variant="primary-dark">Deposit · capital action</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="destructive">Destructive</Button>
            <Button variant="link">Link</Button>
          </div>
        </Section>

        <Section title="Buttons — sizes">
          <div className="flex flex-wrap items-center gap-3">
            <Button size="compact">Compact</Button>
            <Button size="default">Default</Button>
            <Button size="lg">Large</Button>
            <Button size="compact" variant="primary-dark">
              Compact dark
            </Button>
            <Button size="icon" variant="ghost" aria-label="more">
              <MoreHorizontal />
            </Button>
          </div>
        </Section>

        <Section title="NumCell">
          <div className="flex flex-wrap items-baseline gap-6">
            <NumCell value="1,234,567.89" size="xl" />
            <NumCell value="+12.34%" size="lg" sentiment="positive" />
            <NumCell value="-5.67%" size="lg" sentiment="negative" />
            <NumCell value="243.50" prefix="$" sentiment="brand" />
            <NumCell value="500" suffix="bps" sentiment="neutral" />
          </div>
        </Section>

        <Section title="Sparkline">
          <div className="grid grid-cols-3 gap-4 items-center">
            <div className="space-y-1">
              <div className="text-label">Auto · uptrend</div>
              <Sparkline data={SPARK_UP} />
            </div>
            <div className="space-y-1">
              <div className="text-label">Auto · downtrend</div>
              <Sparkline data={SPARK_DOWN} />
            </div>
            <div className="space-y-1">
              <div className="text-label">Empty</div>
              <Sparkline data={[]} />
            </div>
          </div>
        </Section>

        <Section title="Pill">
          <div className="flex flex-wrap gap-2">
            <Pill>neutral</Pill>
            <Pill tone="brand" dot>
              brand
            </Pill>
            <Pill tone="positive" dot>
              live
            </Pill>
            <Pill tone="negative" dot>
              breached
            </Pill>
            <Pill tone="warning" dot>
              cure window
            </Pill>
          </div>
        </Section>

        <Section title="SkinInGamePill">
          <div className="flex flex-wrap gap-3">
            <SkinInGamePill stakeBps={1200} />
            <SkinInGamePill stakeBps={530} />
            <SkinInGamePill stakeBps={380} />
            <SkinInGamePill stakeBps={420} inCure />
          </div>
        </Section>

        <Section title="Avatar">
          <div className="flex items-end gap-3">
            <Avatar name="Alice Tanaka" size="xs" />
            <Avatar name="Brendan Yi" size="sm" />
            <Avatar name="Cyrus Patel" size="md" />
            <Avatar name="Dani Okafor" size="lg" />
            <Avatar name="Erin Schmidt" size="xl" />
          </div>
        </Section>

        <Section title="Badge (shadcn)">
          <div className="flex flex-wrap gap-2">
            <Badge>default</Badge>
            <Badge variant="secondary">secondary</Badge>
            <Badge variant="outline">outline</Badge>
            <Badge variant="destructive">destructive</Badge>
          </div>
        </Section>

        <Section title="EmptyState">
          <EmptyState
            icon={Inbox}
            title="No positions yet"
            description="Deposit into a creator vault to see your positions appear here."
            action={<Button>Browse creators</Button>}
          />
        </Section>

        <Section title="Skeleton">
          <div className="space-y-2 max-w-sm">
            <Skeleton shape="line" className="w-32" />
            <Skeleton shape="line" className="w-48" />
            <Skeleton shape="rect" className="h-20" />
            <div className="flex items-center gap-3">
              <Skeleton shape="circle" className="size-8" />
              <Skeleton shape="line" className="w-24" />
            </div>
          </div>
        </Section>

        <Section title="Input + Select">
          <div className="grid grid-cols-2 gap-4 max-w-xl">
            <Input placeholder="0.00 USDC" />
            <Select>
              <SelectTrigger>
                <SelectValue placeholder="Pick a chain" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="testnet">Hyperliquid Testnet</SelectItem>
                <SelectItem value="mainnet">Hyperliquid Mainnet</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </Section>

        <Section title="Tabs">
          <Tabs defaultValue="overview">
            <TabsList>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="positions">Positions</TabsTrigger>
              <TabsTrigger value="activity">Activity</TabsTrigger>
            </TabsList>
            <TabsContent value="overview" className="pt-3 text-ink-2">
              Overview tab content.
            </TabsContent>
            <TabsContent value="positions" className="pt-3 text-ink-2">
              Positions tab content.
            </TabsContent>
            <TabsContent value="activity" className="pt-3 text-ink-2">
              Activity tab content.
            </TabsContent>
          </Tabs>
        </Section>

        <Section title="Tooltip / Dropdown / Popover">
          <div className="flex flex-wrap gap-3">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost">
                  <TrendingUp />
                  Hover me
                </Button>
              </TooltipTrigger>
              <TooltipContent>I am a tooltip.</TooltipContent>
            </Tooltip>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="secondary">Dropdown</Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuLabel>Account</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem>Profile</DropdownMenuItem>
                <DropdownMenuItem>Positions</DropdownMenuItem>
                <DropdownMenuItem>Disconnect</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline">Popover</Button>
              </PopoverTrigger>
              <PopoverContent>
                <div className="space-y-1 text-[13px]">
                  <div className="font-medium">Popover</div>
                  <div className="text-ink-2">Arbitrary content slot.</div>
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </Section>

        <Section title="Slider + Switch">
          <div className="space-y-6 max-w-md">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-label">Stake target</span>
                <NumCell value={`${sliderVal[0]}%`} sentiment="brand" />
              </div>
              <Slider
                value={sliderVal}
                onValueChange={setSliderVal}
                min={0}
                max={100}
                step={1}
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-label">Use mock contracts</span>
              <Switch checked={switchOn} onCheckedChange={setSwitchOn} />
            </div>
          </div>
        </Section>

        <Section title="Table">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Creator</TableHead>
                <TableHead>TVL</TableHead>
                <TableHead>30d</TableHead>
                <TableHead>Skin</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell className="flex items-center gap-2">
                  <Avatar name="Alice Tanaka" size="sm" />
                  alice.eth
                </TableCell>
                <TableCell>
                  <NumCell value="1,243,500" prefix="$" />
                </TableCell>
                <TableCell>
                  <NumCell value="+12.4%" sentiment="positive" />
                </TableCell>
                <TableCell>
                  <SkinInGamePill stakeBps={870} />
                </TableCell>
                <TableCell>
                  <Pill tone="positive" dot>
                    live
                  </Pill>
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="flex items-center gap-2">
                  <Avatar name="Brendan Yi" size="sm" />
                  brendan.eth
                </TableCell>
                <TableCell>
                  <NumCell value="486,200" prefix="$" />
                </TableCell>
                <TableCell>
                  <NumCell value="-3.1%" sentiment="negative" />
                </TableCell>
                <TableCell>
                  <SkinInGamePill stakeBps={420} inCure />
                </TableCell>
                <TableCell>
                  <Pill tone="warning" dot>
                    cure
                  </Pill>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </Section>

        <Section title="Dialog">
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="primary-dark">
                <Activity />
                Open deposit dialog
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Deposit USDC</DialogTitle>
                <DialogDescription>
                  Two-step flow: approve, then deposit. No relayer in v1.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3 py-2">
                <Input placeholder="Amount in USDC" />
                <div className="text-[12px] text-ink-2">
                  Minimum deposit:{" "}
                  <span className="num">$100.00</span>
                </div>
              </div>
              <DialogFooter>
                <Button variant="ghost">Cancel</Button>
                <Button variant="primary-dark">Approve & deposit</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </Section>

        <Section title="Sonner toast">
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              onClick={() => toast("Deposit confirmed", { description: "tx 0xabc…def" })}
            >
              Trigger toast
            </Button>
            <Button
              variant="secondary"
              onClick={() => toast.error("Approval rejected", { description: "User cancelled signature" })}
            >
              Trigger error toast
            </Button>
          </div>
        </Section>
      </div>
    </main>
  );
}
