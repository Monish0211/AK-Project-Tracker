import { Badge } from "../../../../components/ui/Badge";
import type { Tone } from "../../../../components/ui/Badge";
import type { PdfImportConfidence } from "../../../../types/PdfImport";

const CONFIDENCE_META: Record<PdfImportConfidence, { label: string; tone: Tone }> = {
  100: { label: "Exact Match", tone: "success" },
  90: { label: "Strong Match", tone: "accent" },
  70: { label: "Partial Match", tone: "warning" },
  40: { label: "Low Confidence", tone: "danger" },
  0: { label: "Not Found", tone: "neutral" },
};

interface Props {
  confidence: PdfImportConfidence;
  className?: string;
}

export const ConfidenceBadge = ({ confidence, className }: Props) => {
  const meta = CONFIDENCE_META[confidence] ?? CONFIDENCE_META[0];

  return (
    <Badge tone={meta.tone} className={className}>
      {confidence}% · {meta.label}
    </Badge>
  );
};

export default ConfidenceBadge;
