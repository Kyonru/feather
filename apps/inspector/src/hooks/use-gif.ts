import { createGif } from '@/utils/assets';
import { useQuery } from '@tanstack/react-query';

export const useGif = (name: string, images: string[], fps: number, width: number, height: number) => {
  const { data, isLoading, error } = useQuery<string>({
    queryKey: ['gif-create', images, name, fps, width, height],
    queryFn: async () => {
      const gif = await createGif({
        name,
        images,
        fps,
        width,
        height,
      });
      return gif;
    },
    enabled: images.length > 0 && width > 0 && height > 0 && fps > 0,
  });

  return {
    data,
    isLoading,
    error,
  };
};
