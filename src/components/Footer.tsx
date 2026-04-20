import { Link } from "react-router-dom";

const Footer = () => {
  return (
    <footer className="border-t border-border mt-10">
      <div className="container mx-auto px-4 py-6 flex flex-col md:flex-row items-center justify-between text-sm text-muted-foreground">
        
        <div>© DJHUB {new Date().getFullYear()}</div>

        <div className="flex gap-4 mt-3 md:mt-0">
          <Link to="/privacy" className="hover:text-foreground transition">
            Политика конфиденциальности
          </Link>
        </div>

      </div>
    </footer>
  );
};

export default Footer;