import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4 text-center">
      <div className="space-y-4 max-w-md">
        <h1 className="text-4xl font-bold tracking-tight text-foreground">404</h1>
        <h2 className="text-xl font-semibold text-muted-foreground">Page Not Found</h2>
        <p className="text-sm text-muted-foreground">
          The page or resource you are looking for does not exist or has been disabled.
        </p>
        <div className="pt-2">
          <Button render={<Link href="/" />} nativeButton={false}>
            Return to Dashboard
          </Button>
        </div>
      </div>
    </div>
  );
}

