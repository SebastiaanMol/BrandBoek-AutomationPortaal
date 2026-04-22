import { useParams, Navigate } from "react-router-dom";
import { useAutomatiseringen } from "@/lib/hooks";
import { AutomatiseringForm } from "@/components/AutomatiseringForm";
import { Loader2 } from "lucide-react";

export default function BewerkAutomatisering() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading } = useAutomatiseringen();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const item = data?.find((a) => a.id === id);
  if (!item) return <Navigate to="/alle" replace />;

  return (
    <div>
      <h1 className="text-xl font-semibold mb-6">Bewerk {item.id} — {item.naam}</h1>
      <AutomatiseringForm
        editMode
        editId={item.id}
        prefill={item}
      />
    </div>
  );
}
