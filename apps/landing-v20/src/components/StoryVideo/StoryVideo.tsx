import './StoryVideo.css';

const STORY_CARDS = [
  {
    src: '/images/story-grid/prep-1.png',
    alt: 'Home chef preparing fresh vegetables in a home kitchen',
    title: 'Prepare',
    text: 'It starts with the ingredients.',
  },
  {
    src: '/images/story-grid/cook-fresh-pot.png',
    alt: 'Home chef adding fresh vegetables into a pot on the stove',
    title: 'Cook',
    text: 'Familiar recipes take shape.',
  },
  {
    src: '/images/story-grid/cook-pot.png',
    alt: 'Home chef cooking food in a pot on a stove',
    title: 'Finish',
    text: 'The final touches bring a meal together',
  },
  {
    src: '/images/story-grid/pack-delivery.png',
    alt: 'Home chef packing meals into containers for delivery',
    title: 'Pack',
    text: 'The last step before delivery.',
  },
];

const StoryVideo = () => {
  return (
    <section className="story-video" aria-labelledby="home-chef-story-title">
      <div className="container story-video__shell">
        <div className="story-video__frame">
          <div className="story-video__intro">
            <h2 id="home-chef-story-title" className="story-video__heading">
              The Care Behind The <span className="story-video__heading-accent">Coking.</span>
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
