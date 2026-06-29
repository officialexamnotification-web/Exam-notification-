export interface LinkItem {
  id: string;
  title: string;
  url: string;
  isNew?: boolean;
}

export interface Category {
  id: string;
  title: string;
  links: LinkItem[];
  viewAllUrl?: string;
}
