import { PlusIcon, Trash2Icon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

export type OptionEntry = { key: string; value: string };

type OptionsEditorProps = {
  value: OptionEntry[];
  onChange: (next: OptionEntry[]) => void;
};

/** Free-form key/value editor backing the Connection.options record. */
export function OptionsEditor({ value, onChange }: OptionsEditorProps) {
  return (
    <div className="grid gap-2">
      <Label>Options</Label>
      {value.map((entry, index) => (
        <div key={index} className="flex items-center gap-2">
          <Input
            placeholder="key"
            value={entry.key}
            onChange={(e) => {
              const next = [...value];
              next[index] = { ...next[index], key: e.target.value };
              onChange(next);
            }}
          />
          <Input
            placeholder="value"
            value={entry.value}
            onChange={(e) => {
              const next = [...value];
              next[index] = { ...next[index], value: e.target.value };
              onChange(next);
            }}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Remove option"
            onClick={() => onChange(value.filter((_, i) => i !== index))}
          >
            <Trash2Icon className="size-4" />
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="justify-self-start"
        onClick={() => onChange([...value, { key: "", value: "" }])}
      >
        <PlusIcon /> Add option
      </Button>
    </div>
  );
}
