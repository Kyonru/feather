import { createGif } from '@/utils/assets';
import { useQuery } from '@tanstack/react-query';

export const useGif = (name: string, images: string[], fps: number, width: number, height: number) => {
  const { data, isLoading, error } = useQuery<string>({
    queryKey: ['gif-create', ...images, name, fps, width, height],
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
  });

  return {
    data,
    isLoading,
    error,
  };
};
