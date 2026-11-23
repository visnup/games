import { DECK } from "../../cards.ts";
import { Card } from "../../components/Card";

/** Every card, and banked: for `Cards.spec.ts`'s screenshot. */
export default function Cards() {
  return (
    <main className="flex flex-col gap-4 p-4">
      {[false, true].map((banked) => (
        <div key={String(banked)} className="flex flex-wrap gap-2">
          {DECK.map((c, i) => (
            <Card key={i} card={c} banked={banked} />
          ))}
        </div>
      ))}
    </main>
  );
}
