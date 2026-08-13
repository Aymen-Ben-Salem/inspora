export function BrandMark({
  responsive = false,
}: {
  priority?: boolean;
  responsive?: boolean;
}) {
  return (
    <span
      className={`relative block overflow-hidden ${
        responsive
          ? "h-[29px] w-8"
          : "h-[41px] w-[45px]"
      }`}
      aria-hidden="true"
    >
      <svg
        viewBox="8 10 48 44"
        preserveAspectRatio="none"
        className="block size-full"
        focusable="false"
      >
        <path
          fill="currentColor"
          d="M8 54V10h27.5C46.82 10 56 19.18 56 30.5V54H41.5V32c0-4.14-3.36-7.5-7.5-7.5H22.5V54H8Z"
        />
      </svg>
    </span>
  );
}
