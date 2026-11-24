import { Button } from "@/components/ui/button";
import { callNowAction } from "@/app/app/parents/[id]/call-now-action";

export function CallNowButton({ parentId }: { parentId: string }) {
  return (
    <form action={callNowAction.bind(null, parentId)}>
      <Button type="submit">Call now</Button>
    </form>
  );
}
