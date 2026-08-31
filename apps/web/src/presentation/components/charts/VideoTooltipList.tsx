import type { TooltipVideo } from './videoMarkers.tsx';

/** Bloc « vidéos publiées » d'une infobulle, avec les miniatures. */
export const VideoTooltipList = ({ videos }: { videos: TooltipVideo[] }) => {
  if (videos.length === 0) return null;

  return (
    <div className="mt-2 space-y-1.5 border-t border-border pt-2">
      <p className="text-[11px] font-medium text-popover-foreground">
        {videos.length} vidéo{videos.length > 1 ? 's' : ''} publiée{videos.length > 1 ? 's' : ''}
      </p>
      {videos.slice(0, 3).map((video) => (
        <div key={video.id} className="flex items-center gap-2">
          {video.thumbnailUrl && (
            <img
              src={video.thumbnailUrl}
              alt=""
              loading="lazy"
              className="h-9 w-16 shrink-0 rounded object-cover"
            />
          )}
          <span className="line-clamp-2 text-muted-foreground" style={{ maxWidth: 180 }}>
            {video.title}
          </span>
        </div>
      ))}
      {videos.length > 3 && (
        <p className="text-muted-foreground">et {videos.length - 3} de plus…</p>
      )}
    </div>
  );
};
