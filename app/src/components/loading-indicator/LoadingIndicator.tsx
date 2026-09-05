import { LucideLoader2, type LucideProps } from 'lucide-react';
import { useLayoutEffect, useRef, useState } from 'react';

export function LoadingIndicator({
  className,
  visibilityDelay = true,
  ...props
}: { className?: string; visibilityDelay?: boolean } & LucideProps) {
  const visibilityTimeout = useRef<NodeJS.Timeout>(undefined);
  const [isVisible, setIsVisible] = useState<boolean>(false);

  useLayoutEffect(() => {
    visibilityTimeout.current = setTimeout(() => {
      try {
        setIsVisible(true);
      } catch (err) {
        console.warn(err);
      }
    }, 1500);
    return () => {
      clearTimeout(visibilityTimeout.current);
    };
  }, []);

  if (visibilityDelay && !isVisible) {
    return <></>;
  }

  return (
    <LucideLoader2
      {...props}
      className={`${visibilityDelay} animate-spin animation-duration-[450ms] ${className}`}
    />
  );
}
