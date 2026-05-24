import { ChevronDown } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface StepLogicDetailsProps {
  logic: string;
  className?: string;
}

export function StepLogicDetails({ logic, className = "" }: StepLogicDetailsProps): React.ReactNode {
  return (
    <Collapsible className={`mt-2 ${className}`}>
      <CollapsibleTrigger className="group inline-flex min-h-[44px] items-center gap-1.5 rounded-md bg-white/55 px-3 py-2 text-[11px] font-semibold leading-none text-current/70 transition-colors hover:bg-white/75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current/25 focus-visible:ring-offset-2">
        Logica
        <ChevronDown className="h-3 w-3 transition-transform group-data-[state=open]:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <p className="mt-1 rounded-md bg-white/55 px-2 py-1.5 text-[11px] leading-relaxed text-current/70">
          {logic}
        </p>
      </CollapsibleContent>
    </Collapsible>
  );
}
