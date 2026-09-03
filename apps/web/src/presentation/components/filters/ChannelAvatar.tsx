import type { Channel } from '../../../domain/channel/entities/Channel.ts';
import { readableTextColor } from '../../../shared/contrast.ts';
import { cn } from '../../../shared/cn.ts';

interface ChannelAvatarProps {
  channel: Pick<Channel, 'name' | 'color' | 'thumbnailUrl'>;
  /** Diamètre en pixels. 20 dans une liste dense, 28 dans un déclencheur. */
  size?: number;
  className?: string;
}

/**
 * La pastille d'une chaîne : sa miniature YouTube, ou son initiale sur sa couleur.
 *
 * Le repli n'est pas un cas d'erreur — une chaîne en mode manuel n'a pas de miniature,
 * et une chaîne qui n'a jamais été collectée non plus. L'initiale sur la couleur de la
 * chaîne reste reconnaissable, parce que c'est déjà cette couleur qui l'identifie
 * partout ailleurs dans l'outil. La couleur du texte est calculée pour être lisible sur
 * n'importe quel fond (`readableTextColor`).
 */
export const ChannelAvatar = ({ channel, size = 20, className }: ChannelAvatarProps) => {
  const style = { width: size, height: size };

  if (channel.thumbnailUrl) {
    return (
      <img
        src={channel.thumbnailUrl}
        alt=""
        style={style}
        className={cn('shrink-0 rounded-full object-cover', className)}
      />
    );
  }

  return (
    <span
      aria-hidden
      style={{
        ...style,
        backgroundColor: channel.color,
        color: readableTextColor(channel.color),
        fontSize: Math.round(size * 0.5),
      }}
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full font-semibold uppercase',
        className,
      )}
    >
      {channel.name.trim().charAt(0) || '?'}
    </span>
  );
};
