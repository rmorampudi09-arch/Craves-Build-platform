import './StoryVideo.css';

const STORY_CARDS = [
  {
    src: '/images/story-grid/prep-1.png',
    alt: 'Home chef preparing fresh vegetables in a home kitchen',
    title: 'Good food starts fresh',
    text: 'Fresh ingredients, thoughtfully prepared for the flavours that feel like home.',
  },
  {
    src: '/images/story-grid/cook-fresh-pot.png',
    alt: 'Home chef adding fresh vegetables into a pot on the stove',
    title: 'Homestyle, from the first stir',
    text: 'Familiar recipes come together, one small batch at a time.',
  },
  {
    src: '/images/story-grid/cook-pot.png',
    alt: 'Home chef cooking food in a pot on a stove',
    title: 'Care in every simmer',
    text: 'Patiently cooked for the comforting flavours you look forward to.',
  },
  {
    src: '/images/story-grid/pack-delivery.png',
    alt: 'Home chef packing meals into containers for delivery',
    title: 'Packed for your table',
    text: 'Carefully packed to bring a little homemade happiness to your day.',
  },
];

const StoryVideo = () => {
  return (
    <section className="story-video" aria-labelledby="home-chef-story-title">
      <div className="container story-video__shell">
        <div className="story-video__frame">
          <div className="story-video__intro">
            <h2 id="home-chef-story-title" className="story-video__heading">
              Meet the <span className="story-video__heading-accent">Home Chefs</span>
            </h2>
          </div>

          <div className="story-video__grid">
            {STORY_CARDS.map((card) => (
              <article className="story-video__card" key={card.title}>
                <div className="story-video__image-wrap">
                  <img className="story-video__image" src={card.src} alt={card.alt} loading="lazy" decoding="async" />
                </div>
                <div className="story-video__copy">
                  <h3>{card.title}</h3>
                  <p>{card.text}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default StoryVideo;
