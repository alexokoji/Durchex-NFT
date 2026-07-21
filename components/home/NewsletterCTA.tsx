import { Mail, Rocket } from "lucide-react";
import { Button } from "@/components/ui/Button";

export function NewsletterCTA() {
  return (
    <section className="max-w-7xl mx-auto px-6 py-14">
      <div className="grid sm:grid-cols-2 gap-5">
        <div className="surface-card p-8 flex flex-col justify-center">
          <Mail className="w-6 h-6 text-purple-400 mb-4" />
          <h3 className="font-display text-xl font-semibold text-white mb-2">
            Stay ahead of the drops
          </h3>
          <p className="text-sm text-white/50 mb-5">
            Get notified about new collections, live auctions and platform updates.
          </p>
          <form className="flex gap-2">
            <input
              type="email"
              placeholder="you@example.com"
              className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-white/35 focus:outline-none focus:border-purple-500/60"
            />
            <Button variant="primary" size="md">
              Subscribe
            </Button>
          </form>
        </div>
        <div className="surface-card p-8 flex flex-col justify-center bg-gradient-to-br from-purple-900/40 to-surface-2 border-purple-500/30">
          <Rocket className="w-6 h-6 text-purple-300 mb-4" />
          <h3 className="font-display text-xl font-semibold text-white mb-2">
            Ready to launch your collection?
          </h3>
          <p className="text-sm text-white/50 mb-5">
            List your first item for free — it mints only when it sells.
          </p>
          <Button href="/create" variant="primary" size="md" className="self-start">
            Start Creating
          </Button>
        </div>
      </div>
    </section>
  );
}
