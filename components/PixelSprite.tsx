/** 도트(픽셀) 이미지 표시: 작은 원본을 흐려짐 없이 확대한다. 비율은 정사각형 고정. */
export default function PixelSprite({
  src,
  alt,
  color = "#64748b",
  className = "",
  imgClassName = "",
}: {
  src: string;
  alt: string;
  color?: string;
  className?: string;
  imgClassName?: string;
}) {
  return (
    <div
      className={`relative flex aspect-square w-full items-center justify-center overflow-hidden bg-slate-900/60 ${className}`}
      style={{ boxShadow: `inset 0 0 0 1px ${color}80` }}
    >
      <div className="absolute inset-0 opacity-30" style={{ background: `radial-gradient(circle at 50% 45%, ${color}, transparent 70%)` }} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        draggable={false}
        className={`relative h-[85%] w-[85%] object-contain ${imgClassName}`}
        style={{ imageRendering: "pixelated" }}
      />
    </div>
  );
}
