import type { ImgHTMLAttributes } from "react";

export default function Image(props: ImgHTMLAttributes<HTMLImageElement> & { fill?: boolean }) {
  const { fill: _fill, ...rest } = props;
  return <img {...rest} />;
}
